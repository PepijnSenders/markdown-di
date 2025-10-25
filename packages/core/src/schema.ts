import { z } from 'zod'
import type { ValidationError } from './types'

/**
 * Schema validation options
 */
export interface SchemaOptions {
  /**
   * Zod schema for validating frontmatter
   */
  schema?: z.ZodSchema
  /**
   * Whether to extend the default markdown-di schema
   */
  extend?: boolean
}

/**
 * Default markdown-di frontmatter schema
 */
const defaultFrontmatterSchema = z.object({
  name: z.string().min(1),
  schema: z.string().optional(),
  partials: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  'output-frontmatter': z.array(z.string()).optional(),
})

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  valid: boolean
  errors: ValidationError[]
  data?: any
}

/**
 * Schema validator for frontmatter
 */
export class SchemaValidator {
  private schema: z.ZodSchema

  constructor(options: SchemaOptions = {}) {
    const { schema, extend = true } = options

    if (schema) {
      if (extend) {
        // Extend the default schema with custom schema
        this.schema = defaultFrontmatterSchema.and(schema)
      } else {
        // Use only the custom schema
        this.schema = schema
      }
    } else {
      // Use default schema
      this.schema = defaultFrontmatterSchema
    }
  }

  /**
   * Validate frontmatter data against schema
   */
  validate(data: any): SchemaValidationResult {
    const result = this.schema.safeParse(data)

    if (result.success) {
      return {
        valid: true,
        errors: [],
        data: result.data,
      }
    }

    // Convert Zod errors to ValidationError format
    const errors: ValidationError[] = result.error.issues.map((issue) => ({
      type: 'schema',
      message: this.formatErrorMessage(issue),
      location: issue.path.join('.') || 'root',
    }))

    return {
      valid: false,
      errors,
    }
  }

  /**
   * Validate a single file with schema
   */
  async validateFile(filePath: string, options?: SchemaOptions): Promise<SchemaValidationResult> {
    const { readFileSync } = await import('node:fs')
    const { FrontmatterProcessor } = await import('./processor')

    const content = readFileSync(filePath, 'utf-8')
    const frontmatterProcessor = new FrontmatterProcessor()
    const { frontmatter } = frontmatterProcessor.extract(content)

    const validator = new SchemaValidator(options)
    return validator.validate(frontmatter)
  }

  private formatErrorMessage(issue: z.ZodIssue): string {
    switch (issue.code) {
      case 'invalid_type':
        return `Expected ${issue.expected}, received ${issue.received}`
      case 'invalid_literal':
        return `Invalid literal value, expected ${issue.expected}`
      case 'unrecognized_keys':
        return `Unrecognized key${issue.keys.length > 1 ? 's' : ''}: ${issue.keys.join(', ')}`
      case 'invalid_union':
        return `Invalid union - should match at least one of ${issue.unionErrors.map((e) => JSON.stringify(e)).join(', ')}`
      case 'invalid_enum_value':
        return `Invalid enum value. Expected ${issue.options.join(', ')}, received ${issue.received}`
      case 'invalid_arguments':
        return `Invalid arguments: ${issue.message}`
      case 'invalid_return_type':
        return `Invalid return type: ${issue.message}`
      case 'invalid_date':
        return `Invalid date: ${issue.message}`
      case 'invalid_string':
        return `Invalid string: ${issue.message}`
      case 'too_small':
        return `Value too small: ${issue.message}`
      case 'too_big':
        return `Value too big: ${issue.message}`
      case 'invalid_intersection_types':
        return `Invalid intersection types: ${issue.message}`
      case 'not_multiple_of':
        return `Not multiple of ${issue.multipleOf}: ${JSON.stringify((issue as any).received)}`
      case 'not_finite':
        return `Value not finite: ${issue.message}`
      default:
        return issue.message || 'Schema validation error'
    }
  }
}

// Re-export Zod for convenience
export { z }

// Helper function for schema creation
export function createSchema<T extends z.ZodSchema>(
  schema: T,
  options: Omit<SchemaOptions, 'schema'> = {},
): SchemaValidator {
  return new SchemaValidator({ ...options, schema })
}
