import { readFileSync } from 'node:fs'
import { isDynamicPattern } from 'fast-glob'
import matter from 'gray-matter'
import Mustache from 'mustache'
import type { CircularDependencyDetector, DependencyResolver } from './resolver'
import type { FrontmatterData, MustacheConfig, ProcessingContext, ValidationError } from './types'

/**
 * Processes markdown content with dependency injection
 */
export class ContentProcessor {
  private mustacheConfig?: MustacheConfig

  constructor(
    private resolver: DependencyResolver,
    private circularDetector: CircularDependencyDetector,
    private frontmatterProcessor: FrontmatterProcessor,
    mustacheConfig?: MustacheConfig,
  ) {
    this.mustacheConfig = mustacheConfig
  }

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
    const view: Record<string, unknown> = { ...frontmatter }

    // Process partials using shared logic
    const { partialsMap, errors: partialProcessingErrors } = await this.processPartials(
      view,
      context,
      resolutionErrors,
    )
    view.partials = partialsMap
    errors.push(...partialProcessingErrors)

    // Render content with Mustache using shared logic
    const { rendered: processedContent, error: renderError } = this.renderWithMustache(
      content,
      view,
      'content',
    )
    if (renderError) {
      errors.push(renderError)
    }

    return { processedContent, errors, dependencies }
  }

  /**
   * Process partials for a given frontmatter and context
   * This is shared logic between main document and nested partial processing
   */
  private async processPartials(
    frontmatter: Record<string, unknown>,
    context: ProcessingContext,
    resolutionErrors: ValidationError[] = [],
  ): Promise<{ partialsMap: Record<string, string>; errors: ValidationError[] }> {
    const partialsMap: Record<string, string> = {}
    const errors: ValidationError[] = []

    if (!frontmatter.partials) {
      return { partialsMap, errors }
    }

    for (const [key, value] of Object.entries(frontmatter.partials)) {
      // Check if this partial already has an error from resolution phase
      const hasResolutionError = resolutionErrors.some(
        (err) => err.location === `partials.${key}`,
      )

      if (hasResolutionError) {
        // Set empty string so Mustache doesn't break
        partialsMap[key] = ''
        continue
      }

      // Create context for nested partial processing
      // Use existing parentContext if available (for nested partials), otherwise use frontmatter
      const partialContext: ProcessingContext = {
        ...context,
        parentContext: context.parentContext !== undefined ? context.parentContext : frontmatter,
      }

      // Only try to resolve content if there was no resolution error
      const { content: fileContent, errors: partialErrors } = await this.resolvePartialContent(
        key,
        value,
        partialContext,
      )
      partialsMap[key] = fileContent
      errors.push(...partialErrors)
    }

    return { partialsMap, errors }
  }

  /**
   * Render content with Mustache templating
   * This is shared logic between main document and partial processing
   */
  private renderWithMustache(
    content: string,
    context: Record<string, unknown>,
    location: string = 'content',
  ): { rendered: string; error?: ValidationError } {
    try {
      // Build Mustache render options
      const renderOptions: any = {
        escape: (text: string) => text // Don't escape - return text as-is
      }

      // Add custom tags if configured
      if (this.mustacheConfig?.tags) {
        renderOptions.tags = this.mustacheConfig.tags
      }

      const rendered = Mustache.render(content, context, {}, renderOptions)
      return { rendered }
    } catch (error) {
      return {
        rendered: content,
        error: {
          type: 'injection',
          message: `Mustache templating error: ${error}`,
          location,
        },
      }
    }
  }

  /**
   * Resolves $parent and $parent('key') references in partial frontmatter
   * Returns the resolved frontmatter and any errors encountered
   */
  private resolveParentReferences(
    partialFrontmatter: Record<string, unknown>,
    parentContext: Record<string, unknown> | undefined,
  ): { resolved: Record<string, unknown>; errors: ValidationError[] } {
    const resolved: Record<string, unknown> = {}
    const errors: ValidationError[] = []

    for (const [key, value] of Object.entries(partialFrontmatter)) {
      if (typeof value === 'string') {
        // Check for $parent or $parent('key') pattern
        const parentMatch = value.match(/^\$parent(?:\(['"](.+?)['"]\))?$/)

        if (parentMatch) {
          if (!parentContext) {
            errors.push({
              type: 'injection',
              message: `Cannot use $parent in key "${key}": no parent context available`,
              location: `partial.${key}`,
            })
            resolved[key] = value
            continue
          }

          // Check if it's $parent('key') or just $parent
          const parentKey = parentMatch[1] || key

          if (parentKey in parentContext) {
            resolved[key] = parentContext[parentKey]
          } else {
            errors.push({
              type: 'injection',
              message: `Parent context does not have key "${parentKey}" referenced by $parent in "${key}"`,
              location: `partial.${key}`,
            })
            resolved[key] = value
          }
        } else {
          resolved[key] = value
        }
      } else {
        resolved[key] = value
      }
    }

    return { resolved, errors }
  }

  /**
   * Resolve a partial definition to its file content
   * Now supports partials with frontmatter and variable interpolation
   */
  private async resolvePartialContent(
    _key: string,
    value: string | string[],
    context: ProcessingContext,
  ): Promise<{ content: string; errors: ValidationError[] }> {
    const contents: string[] = []
    const allErrors: ValidationError[] = []

    const patterns = Array.isArray(value) ? value : [value]

    for (const pattern of patterns) {
      // Check if it's a glob pattern using fast-glob's helper
      if (isDynamicPattern(pattern)) {
        // Treat as glob pattern
        const filePaths = this.resolver.resolveGlobPattern(context.baseDir, pattern)
        for (const filePath of filePaths) {
          const { content, errors } = await this.processPartialFile(filePath, context)
          contents.push(content)
          allErrors.push(...errors)
        }
      } else {
        // Treat as single file path
        const fullPath = this.resolver.resolveFilePath(context.baseDir, pattern)
        const { content, errors } = await this.processPartialFile(fullPath, context)
        contents.push(content)
        allErrors.push(...errors)
      }
    }

    return {
      content: contents.join('\n\n'),
      errors: allErrors,
    }
  }

  /**
   * Process a single partial file, handling frontmatter and variable interpolation
   */
  private async processPartialFile(
    filePath: string,
    context: ProcessingContext,
  ): Promise<{ content: string; errors: ValidationError[] }> {
    const rawContent = readFileSync(filePath, 'utf-8')
    const errors: ValidationError[] = []

    // Check for circular dependencies
    if (context.visitedFiles.has(filePath)) {
      errors.push({
        type: 'circular',
        message: `Circular dependency detected: file ${filePath} is already being processed`,
        location: filePath,
      })
      return { content: '', errors }
    }

    // Add to visited files
    context.visitedFiles.add(filePath)

    // Try to extract frontmatter from the partial
    const { frontmatter, body, errors: fmErrors } = this.frontmatterProcessor.extract(rawContent)

    // If no frontmatter found, return content as-is (backward compatibility)
    if (fmErrors.length > 0 || Object.keys(frontmatter).length === 0) {
      // Remove from visited files before returning
      context.visitedFiles.delete(filePath)
      return { content: rawContent, errors: [] }
    }

    // Resolve $parent references in partial's frontmatter
    const { resolved: partialFrontmatter, errors: parentErrors } = this.resolveParentReferences(
      frontmatter,
      context.parentContext,
    )
    errors.push(...parentErrors)

    // Merge contexts: partial frontmatter takes precedence over parent
    const mergedContext = {
      ...(context.parentContext || {}),
      ...partialFrontmatter,
    }

    // Process nested partials using shared logic
    const nestedContext: ProcessingContext = {
      ...context,
      parentContext: mergedContext,
      currentFile: filePath,
    }
    const { partialsMap, errors: nestedPartialErrors } = await this.processPartials(
      partialFrontmatter,
      nestedContext,
    )
    mergedContext.partials = partialsMap
    errors.push(...nestedPartialErrors)

    // Render the partial body with merged context using shared logic
    const { rendered: processedContent, error: renderError } = this.renderWithMustache(
      body,
      mergedContext,
      filePath,
    )
    if (renderError) {
      errors.push(renderError)
    }

    // Remove from visited files after processing
    context.visitedFiles.delete(filePath)

    return { content: processedContent, errors }
  }
}

/**
 * Handles frontmatter extraction and parsing
 */
export class FrontmatterProcessor {
  extract(content: string): {
    frontmatter: FrontmatterData
    body: string
    errors: ValidationError[]
  } {
    const errors: ValidationError[] = []

    try {
      // Use gray-matter to extract frontmatter
      // Configure to avoid HTML entity encoding
      const parsed = matter(content, {
        engines: {
          yaml: (input: string) => {
            const yaml = require('yaml');
            return yaml.parse(input);
          }
        }
      })

      if (!parsed.data || Object.keys(parsed.data).length === 0) {
        return {
          frontmatter: { name: '', description: '' },
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
        frontmatter: parsed.data as FrontmatterData,
        body: parsed.content,
        errors,
      }
    } catch (error) {
      errors.push({
        type: 'frontmatter',
        message: `Failed to extract frontmatter: ${error}`,
        location: 'document start',
      })

      return {
        frontmatter: { name: '', description: '' },
        body: content,
        errors,
      }
    }
  }
}
