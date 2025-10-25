import { readFileSync } from 'node:fs'
import { isDynamicPattern } from 'fast-glob'
import matter from 'gray-matter'
import Mustache from 'mustache'
import type { CircularDependencyDetector, DependencyResolver } from './resolver'
import type { FrontmatterData, ProcessingContext, ValidationError } from './types'

/**
 * Processes markdown content with dependency injection
 */
export class ContentProcessor {
  constructor(
    private resolver: DependencyResolver,
    private circularDetector: CircularDependencyDetector,
  ) {}

  async process(
    content: string,
    frontmatter: FrontmatterData,
    context: ProcessingContext,
  ): Promise<{
    processedContent: string
    errors: ValidationError[]
    dependencies: string[]
  }> {
    const errors: ValidationError[] = []

    // Resolve dependencies and check for issues
    const { dependencies, errors: resolutionErrors } = this.resolver.resolve(frontmatter)
    errors.push(...resolutionErrors)

    // Check for circular dependencies
    if (context.currentFile) {
      const circularErrors = this.circularDetector.detect(context.currentFile, dependencies)
      errors.push(...circularErrors)
    }

    // If in validate mode, return early
    if (context.mode === 'validate') {
      return {
        processedContent: content,
        errors,
        dependencies,
      }
    }

    // Create view object from frontmatter
    const view: any = { ...frontmatter }

    // Resolve partials to their file contents
    // Skip if we already have resolution errors for this partial
    if (frontmatter.partials) {
      view.partials = {}

      for (const [key, value] of Object.entries(frontmatter.partials)) {
        // Check if this partial already has an error from resolution phase
        const hasResolutionError = resolutionErrors.some(
          (err) => err.location === `partials.${key}`,
        )

        if (hasResolutionError) {
          // Set empty string so Mustache doesn't break
          view.partials[key] = ''
          continue
        }

        // Only try to resolve content if there was no resolution error
        const fileContent = await this.resolvePartialContent(key, value, context)
        view.partials[key] = fileContent
      }
    }

    // Use Mustache to render everything in one pass
    let processedContent: string
    try {
      processedContent = Mustache.render(content, view)
    } catch (error) {
      errors.push({
        type: 'injection',
        message: `Mustache templating error: ${error}`,
        location: 'content',
      })
      processedContent = content
    }

    return { processedContent, errors, dependencies }
  }

  /**
   * Resolve a partial definition to its file content
   */
  private async resolvePartialContent(
    _key: string,
    value: string | string[],
    context: ProcessingContext,
  ): Promise<string> {
    const contents: string[] = []

    const patterns = Array.isArray(value) ? value : [value]

    for (const pattern of patterns) {
      // Check if it's a glob pattern using fast-glob's helper
      if (isDynamicPattern(pattern)) {
        // Treat as glob pattern
        const filePaths = this.resolver.resolveGlobPattern(context.baseDir, pattern)
        for (const filePath of filePaths) {
          const content = readFileSync(filePath, 'utf-8')
          contents.push(content)
        }
      } else {
        // Treat as single file path
        const fullPath = this.resolver.resolveFilePath(context.baseDir, pattern)
        const content = readFileSync(fullPath, 'utf-8')
        contents.push(content)
      }
    }

    return contents.join('\n\n')
  }
}

/**
 * Handles frontmatter extraction and parsing
 */
export class FrontmatterProcessor {
  extract(content: string): { frontmatter: any; body: string; errors: ValidationError[] } {
    const errors: ValidationError[] = []

    try {
      // Use gray-matter to extract frontmatter
      const parsed = matter(content)

      if (!parsed.data || Object.keys(parsed.data).length === 0) {
        return {
          frontmatter: {},
          body: content,
          errors: [
            {
              type: 'frontmatter',
              message: 'No frontmatter found in document',
              location: 'document start',
            },
          ],
        }
      }

      return {
        frontmatter: parsed.data,
        body: parsed.content,
        errors,
      }
    } catch (error) {
      errors.push({
        type: 'frontmatter',
        message: `Failed to extract frontmatter: ${error}`,
        location: 'document start',
      })
      return { frontmatter: {}, body: content, errors }
    }
  }
}
