import matter from 'gray-matter';
import type { ProcessOptions, ProcessResult, ProcessingContext, ValidationError } from './types';
import { FrontmatterValidator } from './validator';
import { ReferenceValidator, ReferenceExistenceValidator } from './validator';
import { DependencyResolver, CircularDependencyDetector } from './resolver';
import { ContentProcessor, FrontmatterProcessor } from './processor';
import { SchemaValidator, parseYamlSchema, validateInlineSchema } from './schema';
import { z } from 'zod';
import * as yaml from 'yaml';

/**
 * Main class for markdown dependency injection
 */
export class MarkdownDI {
  private frontmatterValidator = new FrontmatterValidator();
  private referenceValidator = new ReferenceValidator();
  private referenceExistenceValidator = new ReferenceExistenceValidator();
  private frontmatterProcessor = new FrontmatterProcessor();
  private schemaRegistry = new Map<string, z.ZodSchema<any>>();

  /**
   * Register a schema by name
   */
  registerSchema(name: string, schema: z.ZodSchema<any>): void {
    this.schemaRegistry.set(name, schema);
  }

  /**
   * Register schemas from configuration object
   */
  registerSchemas(schemas: Record<string, z.ZodSchema<any>>): void {
    Object.entries(schemas).forEach(([name, schema]) => {
      this.registerSchema(name, schema);
    });
  }

  /**
   * Get a registered schema by name
   */
  getSchema(name: string): z.ZodSchema<any> | undefined {
    return this.schemaRegistry.get(name);
  }

  /**
   * Process markdown content with dependency injection
   */
  async process(options: ProcessOptions): Promise<ProcessResult> {
    const context: ProcessingContext = {
      baseDir: options.baseDir,
      mode: options.mode || 'build',
      visitedFiles: new Set(),
      currentFile: options.currentFile
    };

    // Register any schemas from options
    if (options.schemas) {
      this.registerSchemas(options.schemas);
    }

    // Extract and validate frontmatter
    let { frontmatter, body, errors: frontmatterErrors } = this.frontmatterProcessor.extract(options.content);

    // Combine all errors
    const allErrors: ProcessResult['errors'] = [...frontmatterErrors];

    // Validate frontmatter structure
    const frontmatterValidationErrors = this.frontmatterValidator.validate(frontmatter);
    allErrors.push(...frontmatterValidationErrors);

    // Handle schema prop in frontmatter
    let validationSchema: z.ZodSchema<any> | null = null;

    if (frontmatter.schema) {
      if (typeof frontmatter.schema === 'string') {
        // Reference to registered schema
        const registeredSchema = this.getSchema(frontmatter.schema);
        if (registeredSchema) {
          validationSchema = registeredSchema;
        } else {
          allErrors.push({
            type: 'schema',
            message: `Referenced schema '${frontmatter.schema}' is not registered`,
            location: 'schema'
          });
        }
      } else if (typeof frontmatter.schema === 'object') {
        // Inline schema definition
        try {
          validationSchema = parseYamlSchema(yaml.stringify(frontmatter.schema));
        } catch (error) {
          allErrors.push({
            type: 'schema',
            message: `Invalid inline schema: ${error instanceof Error ? error.message : String(error)}`,
            location: 'schema'
          });
        }
      }
    }

    // Validate against schema if provided (from frontmatter or options)
    if (validationSchema) {
      const schemaValidator = new SchemaValidator({ schema: validationSchema });
      const schemaResult = schemaValidator.validate(frontmatter);

      if (!schemaResult.valid) {
        allErrors.push(...schemaResult.errors);
      } else {
        // Update frontmatter with validated/transformed data
        frontmatter = schemaResult.data;
      }
    } else if (options.schema) {
      // Fallback to CLI-provided schema
      const schemaValidator = new SchemaValidator(options.schema);
      const schemaResult = schemaValidator.validate(frontmatter);

      if (!schemaResult.valid) {
        allErrors.push(...schemaResult.errors);
      } else {
        // Update frontmatter with validated/transformed data
        frontmatter = schemaResult.data;
      }
    }

    // Validate reference syntax in content
    const syntaxValidationErrors = this.referenceValidator.validate(body);
    allErrors.push(...syntaxValidationErrors);

    // Validate that references exist in frontmatter
    const existenceValidationErrors = this.referenceExistenceValidator.validate(body, frontmatter);
    allErrors.push(...existenceValidationErrors);

    // Validate that injected variables are defined in frontmatter and schema
    const injectionValidationErrors = this.validateInjectionVariables(body, frontmatter, validationSchema || undefined);
    allErrors.push(...injectionValidationErrors);

    // Initialize resolver and detector
    const resolver = new DependencyResolver(context);
    const circularDetector = new CircularDependencyDetector();

    // Resolve dependencies and check for circular references
    const { dependencies, errors: resolutionErrors } = resolver.resolve(frontmatter);
    allErrors.push(...resolutionErrors);

    // Detect circular dependencies
    if (context.currentFile) {
      const circularErrors = circularDetector.detect(context.currentFile, dependencies);
      allErrors.push(...circularErrors);
    }

    // Process content if no errors or in build mode
    let processedContent = body;
    if (allErrors.length === 0 || context.mode === 'build') {
      const processor = new ContentProcessor(resolver, circularDetector);
      const { processedContent: finalContent, errors: processingErrors } = await processor.process(
        body,
        frontmatter,
        context
      );
      processedContent = finalContent;
      allErrors.push(...processingErrors);
    }

    // Reassemble the document with processed frontmatter
    let finalContent;
    try {
      finalContent = this.reassembleDocument(frontmatter, processedContent);
    } catch (error) {
      allErrors.push({
        type: 'frontmatter',
        message: `Failed to reassemble document: ${error}`,
        location: 'document'
      });
      finalContent = options.content; // Return original content if reassembly fails
    }

    return {
      content: finalContent,
      frontmatter,
      errors: allErrors,
      dependencies
    };
  }

  /**
   * Validate that injected variables are defined in frontmatter
   */
  private validateInjectionVariables(body: string, frontmatter: any, validationSchema?: z.ZodSchema<any>): ValidationError[] {
    const errors: ValidationError[] = [];

    // Extract all references from content
    const referenceRegex = /\{\{([^}]+)\}\}/g;
    const matches: string[] = [];
    let match;

    while ((match = referenceRegex.exec(body)) !== null) {
      matches.push(match[1].trim());
    }

    // Get all available variables from frontmatter
    const availableVariables = new Set<string>();

    // Add standard frontmatter fields
    Object.keys(frontmatter).forEach(key => {
      availableVariables.add(key);
    });

    // Add blueprint variables (blueprints.group.key)
    if (frontmatter.blueprints) {
      Object.entries(frontmatter.blueprints).forEach(([group, items]) => {
        Object.entries(items as Record<string, string>).forEach(([key]) => {
          availableVariables.add(`${group}.${key}`);
        });
      });
    }

    // Add reference variables (references.group)
    if (frontmatter.references) {
      Object.entries(frontmatter.references).forEach(([group]) => {
        availableVariables.add(group);
      });
    }

    // Check each reference
    matches.forEach(reference => {
      const parts = reference.split('.');
      const root = parts[0];

      if (!availableVariables.has(reference) && !availableVariables.has(root)) {
        errors.push({
          type: 'injection',
          message: `Injected variable '${reference}' is not defined in frontmatter`,
          location: 'content'
        });
      }
    });

    // If there's a validation schema, ensure all required fields are present
    if (validationSchema) {
      try {
        const result = validationSchema.safeParse(frontmatter);
        if (!result.success) {
          result.error.errors.forEach((issue: any) => {
            errors.push({
              type: 'schema',
              message: `Schema validation failed: ${issue.message}`,
              location: issue.path.join('.')
            });
          });
        }
      } catch (error) {
        errors.push({
          type: 'schema',
          message: `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
          location: 'schema'
        });
      }
    }

    return errors;
  }

  /**
   * Validate markdown content without processing
   */
  async validate(options: Omit<ProcessOptions, 'mode'>): Promise<ProcessResult> {
    return this.process({ ...options, mode: 'validate' });
  }

  /**
   * Reassemble document with frontmatter and processed body
   */
  private reassembleDocument(frontmatter: any, body: string): string {
    // Convert frontmatter back to YAML
    const frontmatterYaml = this.stringifyFrontmatter(frontmatter);

    // Reassemble the document
    return `---\n${frontmatterYaml}\n---\n${body}`;
  }

  /**
   * Convert frontmatter object to YAML string
   */
  private stringifyFrontmatter(frontmatter: any): string {
    const lines: string[] = [];

    // Sort keys for consistent output
    const sortedKeys = Object.keys(frontmatter).sort((a, b) => {
      // Required fields first
      if (a === 'name') return -1;
      if (b === 'name') return 1;
      if (a === 'description') return -1;
      if (b === 'description') return 1;
      // Then blueprints and references
      if (a === 'blueprints') return -1;
      if (b === 'blueprints') return 1;
      if (a === 'references') return -1;
      if (b === 'references') return 1;
      return a.localeCompare(b);
    });

    for (const key of sortedKeys) {
      const value = frontmatter[key];

      if (value === undefined || value === null) continue;

      if (typeof value === 'object' && !Array.isArray(value)) {
        // Handle objects
        lines.push(`${key}:`);
        this.stringifyObject(value, lines, 1);
      } else if (Array.isArray(value)) {
        // Handle arrays
        lines.push(`${key}:`);
        for (const item of value) {
          if (typeof item === 'string') {
            lines.push(`  - ${item}`);
          } else {
            lines.push(`  - ${JSON.stringify(item)}`);
          }
        }
      } else {
        // Handle primitives
        const stringValue = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : value;
        lines.push(`${key}: ${stringValue}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Recursively stringify nested objects
   */
  private stringifyObject(obj: any, lines: string[], indent: number): void {
    const spaces = '  '.repeat(indent);
    const sortedKeys = Object.keys(obj).sort();

    for (const key of sortedKeys) {
      const value = obj[key];

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        lines.push(`${spaces}${key}:`);
        this.stringifyObject(value, lines, indent + 1);
      } else if (Array.isArray(value)) {
        lines.push(`${spaces}${key}:`);
        for (const item of value) {
          lines.push(`${spaces}  - ${item}`);
        }
      } else {
        const stringValue = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : value;
        lines.push(`${spaces}${key}: ${stringValue}`);
      }
    }
  }
}

// Export types and classes
export * from './types';
export * from './validator';
export * from './resolver';
export * from './processor';

// Export the main class as default
/**
 * Schema utilities
 */
export class MarkdownDISchema {
  /**
   * Create a schema validator
   */
  static create(schema: z.ZodSchema<any>, options?: {
    extend?: boolean;
    strict?: boolean;
  }): SchemaValidator {
    return new SchemaValidator({ schema, ...options });
  }

  /**
   * Validate a single file with schema
   */
  static async validateFile(filePath: string, schema?: any, options?: {
    extend?: boolean;
    strict?: boolean;
  }) {
    const validator = new SchemaValidator({ schema, ...options });
    return validator.validateFile(filePath);
  }

  /**
   * Generate TypeScript type from schema
   */
  static generateType(schema: any, typeName = 'Frontmatter'): string {
    const validator = new SchemaValidator({ schema });
    return validator.generateType(schema, typeName);
  }
}

export default MarkdownDI;