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
 * Hook context passed to onBeforeCompile callback
 */
export interface HookContext {
  id: string
  filePath: string
  frontmatter: Record<string, unknown>
  baseDir: string
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
}
