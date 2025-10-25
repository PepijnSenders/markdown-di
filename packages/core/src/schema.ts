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
  partials: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  'output-frontmatter': z.array(z.string()).optional(),
})

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  valid: boolean
  errors: ValidationError[]
  data?: unknown
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
  validate(data: unknown): SchemaValidationResult {
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
    // In Zod v4, the message property is always available and comprehensive
    return issue.message || 'Schema validation error'
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
