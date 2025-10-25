import { existsSync } from 'node:fs'
import { join, normalize, relative } from 'node:path'
import { globSync, isDynamicPattern } from 'fast-glob'
import type {
  DependencyReference,
  FrontmatterData,
  ProcessingContext,
  ValidationError,
} from './types'

/**
 * Resolves dependency references to actual file paths
 */
export class DependencyResolver {
  constructor(private context: ProcessingContext) {}

  /**
   * Resolve a file path relative to baseDir
   */
  resolveFilePath(baseDir: string, filePath: string): string {
    return join(baseDir, filePath)
  }

  /**
   * Resolve a glob pattern to array of file paths
   */
  resolveGlobPattern(baseDir: string, pattern: string): string[] {
    const globPattern = join(baseDir, pattern)
    const matchedFiles = globSync(globPattern, {
      absolute: true,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    })
    return matchedFiles.sort()
  }

  /**
   * Validates that a path doesn't escape the base directory
   */
  private validatePathSafety(path: string, key: string): ValidationError | null {
    // Check for path traversal patterns
    if (path.startsWith('../') || path.startsWith('..\\')) {
      return {
        type: 'file' as const,
        message: `Path traversal not allowed: "${path}" starts with ../`,
        location: `partials.${key}`,
      }
    }

    // Check if path contains .. segments that could escape
    if (path.includes('/../') || path.includes('\\..\\')) {
      return {
        type: 'file' as const,
        message: `Path traversal not allowed: "${path}" contains ../`,
        location: `partials.${key}`,
      }
    }

    // Verify the normalized path stays within baseDir
    const fullPath = normalize(join(this.context.baseDir, path))
    const relativePath = relative(this.context.baseDir, fullPath)

    if (relativePath.startsWith('..') || relativePath.startsWith('/')) {
      return {
        type: 'file' as const,
        message: `Path traversal not allowed: "${path}" escapes base directory`,
        location: `partials.${key}`,
      }
    }

    return null
  }

  resolve(frontmatter: FrontmatterData): { dependencies: string[]; errors: ValidationError[] } {
    const dependencies: string[] = []
    const errors: ValidationError[] = []

    // Resolve partials (supports both single files and glob patterns)
    if (frontmatter.partials) {
      for (const [key, value] of Object.entries(frontmatter.partials)) {
        const patterns = Array.isArray(value) ? value : [value]

        for (const pattern of patterns) {
          // Check if it's a glob pattern using fast-glob's helper
          if (isDynamicPattern(pattern)) {
            // Treat as glob pattern
            const resolved = this.resolvePartialPatterns(key, pattern)
            if (resolved.error) {
              errors.push(resolved.error)
            } else {
              dependencies.push(...resolved.paths)
            }
          } else {
            // Treat as single file path
            const resolved = this.resolvePartialPath(key, pattern)
            if (resolved.error) {
              errors.push(resolved.error)
            } else {
              dependencies.push(resolved.path)
            }
          }
        }
      }
    }

    return { dependencies, errors }
  }

  private resolvePartialPath(key: string, path: string) {
    // First validate path safety
    const safetyError = this.validatePathSafety(path, key)
    if (safetyError) {
      return {
        error: safetyError,
        path: '',
      }
    }

    const fullPath = join(this.context.baseDir, path)

    if (!existsSync(fullPath)) {
      return {
        error: {
          type: 'file' as const,
          message: `Partial file not found: ${path}`,
          location: `partials.${key}`,
        },
        path: '',
      }
    }

    return { path: fullPath }
  }

  private resolvePartialPatterns(key: string, pattern: string) {
    const paths: string[] = []

    // First validate path safety
    const safetyError = this.validatePathSafety(pattern, key)
    if (safetyError) {
      return {
        error: safetyError,
        paths: [],
      }
    }

    try {
      const globPattern = join(this.context.baseDir, pattern)
      const matchedFiles = globSync(globPattern, {
        absolute: true,
        onlyFiles: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      })

      if (matchedFiles.length === 0) {
        return {
          error: {
            type: 'file' as const,
            message: `No files found matching pattern: ${pattern}`,
            location: `partials.${key}`,
          },
          paths: [],
        }
      }

      // Sort files for consistent processing
      matchedFiles.sort()
      paths.push(...matchedFiles)

      return { paths, errors: [] }
    } catch (error) {
      return {
        error: {
          type: 'file' as const,
          message: `Invalid glob pattern "${pattern}": ${error}`,
          location: `partials.${key}`,
        },
        paths: [],
      }
    }
  }

  /**
   * Extract partial references from content and resolve them to file paths
   */
  extractReferences(content: string, frontmatter: FrontmatterData): DependencyReference[] {
    const references: DependencyReference[] = []
    const lines = content.split('\n')
    const partialPattern = /\{\{([^}]+)\}\}/g

    lines.forEach((line, lineIndex) => {
      let match
      while ((match = partialPattern.exec(line)) !== null) {
        const key = match[1].trim()
        const resolved = this.resolvePartialReference(key, frontmatter, lineIndex + 1, match.index)

        if (resolved) {
          references.push(resolved)
        }
      }
    })

    return references
  }

  private resolvePartialReference(
    key: string,
    frontmatter: FrontmatterData,
    line: number,
    column: number,
  ): DependencyReference | null {
    // Check if key is in format "partials.actualKey"
    let partialKey = key
    if (key.startsWith('partials.')) {
      partialKey = key.substring('partials.'.length)
    } else {
      // If not using partials. prefix, this is not a partial reference
      // Could be a regular Mustache variable
      return null
    }

    if (!frontmatter.partials || !frontmatter.partials[partialKey]) {
      return null
    }

    const value = frontmatter.partials[partialKey]
    const paths: string[] = []

    if (typeof value === 'string') {
      // Single file path
      const resolved = this.resolvePartialPath(partialKey, value)
      if (!resolved.error) {
        paths.push(resolved.path)
      }
    } else if (Array.isArray(value)) {
      // Array of paths or glob patterns
      value.forEach((pattern) => {
        const resolved = this.resolvePartialPatterns(partialKey, pattern)
        if (!resolved.error) {
          paths.push(...resolved.paths)
        }
      })
    }

    if (paths.length === 0) {
      return null
    }

    return {
      type: 'partial',
      key,
      fullPath: paths.join('\n'),
      sourceLine: line,
      sourceColumn: column,
    }
  }
}

/**
 * Detects circular dependencies between files
 */
export class CircularDependencyDetector {
  private dependencyGraph: Map<string, string[]> = new Map()

  detect(filePath: string, dependencies: string[]): ValidationError[] {
    const errors: ValidationError[] = []

    // Build dependency graph
    this.dependencyGraph.set(filePath, dependencies)

    // Check for cycles
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    for (const [file] of this.dependencyGraph) {
      if (this.hasCycle(file, visited, recursionStack)) {
        const cycle = this.findCycle(file)
        if (cycle.length > 0) {
          errors.push({
            type: 'circular',
            message: `Circular dependency detected: ${cycle.join(' -> ')} -> ${cycle[0]}`,
            location: filePath,
          })
        }
      }
    }

    return errors
  }

  private hasCycle(file: string, visited: Set<string>, recursionStack: Set<string>): boolean {
    if (!visited.has(file)) {
      visited.add(file)
      recursionStack.add(file)

      const dependencies = this.dependencyGraph.get(file) || []
      for (const dependency of dependencies) {
        if (!visited.has(dependency) && this.hasCycle(dependency, visited, recursionStack)) {
          return true
        } else if (recursionStack.has(dependency)) {
          return true
        }
      }
    }

    recursionStack.delete(file)
    return false
  }

  private findCycle(startFile: string): string[] {
    const visited = new Set<string>()
    const path: string[] = []

    const dfs = (file: string): boolean => {
      if (path.includes(file)) {
        const cycleStart = path.indexOf(file)
        return path.slice(cycleStart).concat(file).length > 0
      }

      if (visited.has(file)) {
        return false
      }

      visited.add(file)
      path.push(file)

      const dependencies = this.dependencyGraph.get(file) || []
      for (const dependency of dependencies) {
        if (dfs(dependency)) {
          return true
        }
      }

      path.pop()
      return false
    }

    dfs(startFile)
    return path
  }
}
