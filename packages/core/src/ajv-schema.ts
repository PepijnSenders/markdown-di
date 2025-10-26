import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import type { ValidationError } from './types'

/**
 * AJV-based schema validator using JSON Schema
 * This is the recommended validator for CLI and simple use cases
 */
export class AjvSchemaValidator {
  private ajv: Ajv
  private schemas: Map<string, any> = new Map()

  constructor() {
    this.ajv = new Ajv({
      allErrors: true, // Collect all errors, not just the first
      strict: false, // Allow unknown keywords
      validateFormats: true, // Validate format keywords
    })
    addFormats(this.ajv) // Adds date, email, uri, uuid, etc formats
  }

  /**
   * Register a named schema
   */
  registerSchema(name: string, jsonSchema: any): void {
    this.schemas.set(name, jsonSchema)
  }

  /**
   * Load multiple schemas from config
   */
  loadSchemas(schemas: Record<string, any>): void {
    Object.entries(schemas).forEach(([name, schema]) => {
      this.registerSchema(name, schema)
    })
  }

  /**
   * Get list of registered schema names
   */
  getSchemaNames(): string[] {
    return Array.from(this.schemas.keys())
  }

  /**
   * Validate data against a schema
   * @param data - Data to validate
   * @param schema - Schema name (string) or inline JSON Schema object
   */
  validate(
    data: any,
    schema: string | any,
  ): { valid: boolean; errors: ValidationError[] } {
    let jsonSchema: any

    if (typeof schema === 'string') {
      // Named schema reference
      jsonSchema = this.schemas.get(schema)
      if (!jsonSchema) {
        const available = this.getSchemaNames()
        const suggestion =
          available.length > 0
            ? ` Available schemas: ${available.join(', ')}`
            : ' No schemas registered.'
        return {
          valid: false,
          errors: [
            {
              type: 'schema',
              message: `Schema "${schema}" not found.${suggestion}`,
              location: 'frontmatter.schema',
            },
          ],
        }
      }
    } else {
      // Inline JSON Schema object
      jsonSchema = schema
    }

    const valid = this.ajv.validate(jsonSchema, data)

    if (valid) {
      return { valid: true, errors: [] }
    }

    // Convert AJV errors to our ValidationError format
    const errors: ValidationError[] = (this.ajv.errors || []).map((err) => {
      const path = err.instancePath || 'root'
      const message = err.message || 'Validation failed'
      return {
        type: 'schema',
        message: `${path}: ${message}`,
        location: err.instancePath || 'frontmatter',
      }
    })

    return { valid: false, errors }
  }
}
