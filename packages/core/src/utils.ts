import { relative } from 'node:path'

/**
 * Generate a file ID from a file path
 * Converts path segments to dot notation
 * Example: docs/guides/intro.md -> docs.guides.intro
 */
export function generateFileId(filePath: string, baseDir: string): string {
  const relativePath = relative(baseDir, filePath)
  // Remove file extension and replace path separators with dots
  return relativePath.replace(/\.(md|markdown)$/i, '').replace(/[/\\]/g, '.')
}

/**
 * Deep merge two objects
 * Values from source override values in target
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  const result = { ...target } as Record<string, unknown>

  for (const key in source) {
    if (Object.hasOwn(source, key)) {
      const sourceValue = source[key]
      const targetValue = result[key]

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        // Both are objects, merge recursively
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>,
        )
      } else {
        // Override with source value
        result[key] = sourceValue
      }
    }
  }

  return result as T
}
