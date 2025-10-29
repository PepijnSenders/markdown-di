/**
 * Validation error types
 */
export interface ValidationError {
  type: 'frontmatter' | 'partial' | 'file' | 'circular' | 'syntax' | 'schema' | 'injection'
  message: string
  location: string
  details?: unknown
}

/**
 * Mustache template engine configuration
 */
export interface MustacheConfig {
  /**
   * Custom delimiters for template tags
   * Default is ['{{', '}}']
   * @example ['<%', '%>']
   */
  tags?: [string, string]
}

/**
 * Hook context passed to onBeforeCompile callback
 */
export interface HookContext {
  id: string
  filePath: string
  frontmatter: Record<string, unknown>
  baseDir: string
  dynamicFields: string[]
}

/**
 * Variant generator configuration
 * Generates multiple output files from a single template with different data
 */
export interface VariantGenerator {
  /**
   * Array of data objects, one per variant to generate
   */
  data: Record<string, unknown>[]

  /**
   * Callback to determine output path for each variant
   * @param context - Hook context with file information
   * @param data - The variant data object
   * @param index - Index of the variant (0-based)
   * @returns Relative path for the output file
   */
  getOutputPath: (
    context: HookContext,
    data: Record<string, unknown>,
    index: number
  ) => string
}

/**
 * Schema validation result from custom validator
 */
export interface SchemaValidationResult {
  valid: boolean
  errors: ValidationError[]
  data?: unknown
}

/**
 * Processing options
 */
export interface ProcessOptions {
  content: string
  baseDir: string
  mode?: 'validate' | 'build'
  currentFile?: string
  onBeforeCompile?: (
    context: HookContext,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>
  /**
   * Custom validation function for frontmatter
   * This allows users to provide their own validation logic with any validation library
   * @param frontmatter - The frontmatter data to validate
   * @param schemaName - The schema name from frontmatter.schema (if it's a string reference)
   * @returns Validation result with errors if invalid
   */
  validateFrontmatter?: (
    frontmatter: FrontmatterData,
    schemaName?: string
  ) => SchemaValidationResult | Promise<SchemaValidationResult>
  /**
   * Variant generators mapped by file ID
   * Used to generate multiple output files from a single template
   */
  variants?: Record<string, VariantGenerator>
  /**
   * Mustache template engine configuration
   * Allows customization of Mustache behavior like custom delimiters
   */
  mustache?: MustacheConfig
}

/**
 * Processing result
 */
export interface ProcessResult {
  content: string
  frontmatter: FrontmatterData
  errors: ValidationError[]
  dependencies: string[]
}

/**
 * Frontmatter data structure
 */
export interface FrontmatterData {
  id?: string
  name: string
  description: string
  partials?: Record<string, string | string[]>
  'output-frontmatter'?: string[]
  [key: string]: unknown
}

/**
 * Dependency reference
 */
export interface DependencyReference {
  type: 'partial'
  key: string
  fullPath: string
  sourceLine: number
  sourceColumn: number
}

/**
 * Processing context
 */
export interface ProcessingContext {
  baseDir: string
  mode: 'validate' | 'build'
  visitedFiles: Set<string>
  currentFile?: string
  /**
   * Parent document's frontmatter context
   * Used when processing nested partials to allow access to parent variables
   * via $parent or $parent('key') syntax
   */
  parentContext?: Record<string, unknown>
  /**
   * Mustache template engine configuration
   */
  mustache?: MustacheConfig
}
