import { z } from "zod";
import type { ValidationError } from "./types";
import * as yaml from "yaml";

/**
 * Schema validation options
 */
export interface SchemaOptions {
  /**
   * Zod schema for validating frontmatter
   */
  schema?: z.ZodSchema;
  /**
   * Whether to extend the default markdown-di schema
   */
  extend?: boolean;
}

/**
 * Default markdown-di frontmatter schema
 */
const defaultFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  blueprints: z.record(z.record(z.string())).optional(),
  references: z.record(z.array(z.string())).optional(),
});

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  valid: boolean;
  errors: ValidationError[];
  data?: any;
}

/**
 * Schema validator for frontmatter
 */
export class SchemaValidator {
  private schema: z.ZodSchema;

  constructor(options: SchemaOptions = {}) {
    const { schema, extend = true } = options;

    if (schema) {
      if (extend) {
        // Extend the default schema with custom schema
        this.schema = defaultFrontmatterSchema.and(schema);
      } else {
        // Use only the custom schema
        this.schema = schema;
      }
    } else {
      // Use default schema
      this.schema = defaultFrontmatterSchema;
    }
  }

  /**
   * Validate frontmatter data against schema
   */
  validate(data: any): SchemaValidationResult {
    const result = this.schema.safeParse(data);

    if (result.success) {
      return {
        valid: true,
        errors: [],
        data: result.data,
      };
    }

    // Convert Zod errors to ValidationError format
    const errors: ValidationError[] = result.error.issues.map((issue) => ({
      type: "schema",
      message: this.formatErrorMessage(issue),
      location: issue.path.join(".") || "root",
    }));

    return {
      valid: false,
      errors,
    };
  }

  /**
   * Generate TypeScript type definition from schema
   */
  generateTypeDefinition(typeName: string = "Frontmatter"): string {
    return this.generateType(this.schema, typeName);
  }

  /**
   * Validate a single file with schema
   */
  async validateFile(
    filePath: string,
    options?: SchemaOptions
  ): Promise<SchemaValidationResult> {
    const { readFileSync } = await import("fs");
    const { FrontmatterProcessor } = await import("./processor");

    const content = readFileSync(filePath, "utf-8");
    const frontmatterProcessor = new FrontmatterProcessor();
    const { frontmatter } = frontmatterProcessor.extract(content);

    const validator = new SchemaValidator(options);
    return validator.validate(frontmatter);
  }

  private formatErrorMessage(issue: z.ZodIssue): string {
    switch (issue.code) {
      case "invalid_type":
        return `Expected ${issue.expected}, received ${issue.received}`;
      case "invalid_literal":
        return `Invalid literal value, expected ${issue.expected}`;
      case "unrecognized_keys":
        return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${issue.keys.join(", ")}`;
      case "invalid_union":
        return `Invalid union - should match at least one of ${issue.unionErrors.map((e) => JSON.stringify(e)).join(", ")}`;
      case "invalid_enum_value":
        return `Invalid enum value. Expected ${issue.options.join(", ")}, received ${issue.received}`;
      case "invalid_arguments":
        return `Invalid arguments: ${issue.message}`;
      case "invalid_return_type":
        return `Invalid return type: ${issue.message}`;
      case "invalid_date":
        return `Invalid date: ${issue.message}`;
      case "invalid_string":
        return `Invalid string: ${issue.message}`;
      case "too_small":
        return `Value too small: ${issue.message}`;
      case "too_big":
        return `Value too big: ${issue.message}`;
      case "invalid_intersection_types":
        return `Invalid intersection types: ${issue.message}`;
      case "not_multiple_of":
        return `Not multiple of ${issue.multipleOf}: ${JSON.stringify((issue as any).received)}`;
      case "not_finite":
        return `Value not finite: ${issue.message}`;
      default:
        return issue.message || "Schema validation error";
    }
  }

  public generateType(schema: z.ZodSchema, typeName: string): string {
    if (schema instanceof z.ZodObject) {
      const shape = (schema as any)._def.shape();
      const properties = Object.entries(shape)
        .map(([key, def]) => {
          const type = this.zodToType(def as z.ZodType<any>);
          return `  ${key}: ${type};`;
        })
        .join("\n");

      return `export interface ${typeName} {\n${properties}\n}`;
    }

    return `export type ${typeName} = any;`;
  }

  private zodToType(schema: z.ZodType<any>): string {
    if (schema instanceof z.ZodString) return "string";
    if (schema instanceof z.ZodNumber) return "number";
    if (schema instanceof z.ZodBoolean) return "boolean";
    if (schema instanceof z.ZodArray)
      return `${this.zodToType(schema.element)}[]`;
    if (schema instanceof z.ZodRecord)
      return `Record<string, ${this.zodToType((schema as any)._def.valueType as z.ZodType<any>)}>`;
    if (schema instanceof z.ZodOptional)
      return `${this.zodToType(schema.unwrap())} | undefined`;
    if (schema instanceof z.ZodUnion) {
      return schema.options
        .map((opt: z.ZodType<any>) => this.zodToType(opt))
        .join(" | ");
    }
    return "any";
  }
}

// Re-export Zod for convenience
export { z };

// Helper function for schema creation
export function createSchema<T extends z.ZodSchema>(
  schema: T,
  options: Omit<SchemaOptions, "schema"> = {}
): SchemaValidator {
  return new SchemaValidator({ ...options, schema });
}

/**
 * Parse a YAML schema string into a Zod schema
 */
export function parseYamlSchema(yamlString: string): z.ZodSchema<any> {
  try {
    const parsed = yaml.parse(yamlString);
    return convertToZodSchema(parsed);
  } catch (error) {
    throw new Error(
      `Invalid YAML schema: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Validate inline schema definition in YAML
 */
export function validateInlineSchema(yamlString: string): {
  valid: boolean;
  schema?: z.ZodSchema<any>;
  errors: string[];
} {
  try {
    const schema = parseYamlSchema(yamlString);
    return { valid: true, schema, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Convert a plain object schema definition to Zod schema
 */
function convertToZodSchema(def: any): z.ZodSchema<any> {
  if (typeof def !== "object" || def === null) {
    throw new Error("Schema must be an object");
  }

  const shape: Record<string, z.ZodType<any>> = {};

  for (const [key, value] of Object.entries(def)) {
    shape[key] = convertToZodType(key, value);
  }

  return z.object(shape);
}

/**
 * Convert a single schema field to Zod type
 */
function convertToZodType(key: string, def: any): z.ZodType<any> {
  if (typeof def === "string") {
    // Basic type string
    switch (def.toLowerCase()) {
      case "string":
        return z.string();
      case "number":
        return z.number();
      case "boolean":
        return z.boolean();
      case "date":
        return z.string().datetime();
      case "email":
        return z.string().email();
      case "url":
        return z.string().url();
      case "uuid":
        return z.string().uuid();
      default:
        // Assume it's a custom type or reference
        return z.string();
    }
  }

  if (typeof def === "object" && def !== null) {
    if (def.type) {
      // Object with type specification
      let result: z.ZodType<any> = convertToZodType(key, def.type);

      // Add validations based on type
      if (def.type === "string") {
        let stringType = result as z.ZodString;
        if (def.min !== undefined) stringType = stringType.min(def.min);
        if (def.max !== undefined) stringType = stringType.max(def.max);
        result = stringType;
      } else if (def.type === "number") {
        let numberType = result as z.ZodNumber;
        if (def.min !== undefined) numberType = numberType.min(def.min);
        if (def.max !== undefined) numberType = numberType.max(def.max);
        result = numberType;
      }

      if (def.optional) result = result.optional();
      if (def.default !== undefined) result = result.default(def.default);
      if (def.description) result = result.describe(def.description);

      return result;
    }

    if (def.enum) {
      // Enum type
      return z.enum(def.enum);
    }

    if (def.items) {
      // Array type
      const itemType = convertToZodType(`${key}Item`, def.items);
      let result: z.ZodType<any> = z.array(itemType);
      if (def.optional) result = result.optional();
      return result;
    }

    if (def.properties) {
      // Nested object
      const nestedShape: Record<string, z.ZodType<any>> = {};
      for (const [nestedKey, nestedValue] of Object.entries(def.properties)) {
        nestedShape[nestedKey] = convertToZodType(
          `${key}.${nestedKey}`,
          nestedValue
        );
      }
      let result: z.ZodType<any> = z.object(nestedShape);
      if (def.optional) result = result.optional();
      return result;
    }

    if (def.pattern) {
      // String with pattern
      let result: z.ZodType<any> = z.string().regex(new RegExp(def.pattern));
      if (def.optional) result = result.optional();
      return result;
    }

    // Assume it's a nested object without explicit properties
    return convertToZodSchema(def);
  }

  // Default to string type
  return z.string();
}

/**
 * Schema type definitions for YAML
 */
export interface YamlSchemaField {
  type?: "string" | "number" | "boolean" | "date" | "email" | "url" | "uuid";
  min?: number;
  max?: number;
  optional?: boolean;
  default?: any;
  description?: string;
  enum?: any[];
  items?: YamlSchemaField;
  properties?: Record<string, YamlSchemaField>;
  pattern?: string;
}

export interface YamlSchemaDefinition {
  [key: string]: YamlSchemaField | string;
}
