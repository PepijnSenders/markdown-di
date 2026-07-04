import matter from 'gray-matter'
import { ContentProcessor, FrontmatterProcessor } from './processor'
import { DependencyResolver } from './resolver'
import type {
  FrontmatterData,
  HookContext,
  ProcessingContext,
  ProcessOptions,
  ProcessResult,
  ProcessSyncOptions,
  SchemaValidationResult,
  ValidationError,
} from './types'
import { deepMerge, generateFileId } from './utils'
import { PartialValidator } from './validator'

/**
 * Intermediate state shared between the async and sync process pipelines
 */
interface PipelineState {
  context: ProcessingContext
  frontmatter: FrontmatterData
  body: string
  bodyLineOffset: number
  errors: ValidationError[]
  dynamicFields: string[]
  hookContext: HookContext
}

/**
 * Main class for markdown dependency injection
 */
export class MarkdownDI {
  private partialValidator = new PartialValidator()
  private frontmatterProcessor = new FrontmatterProcessor()

  /**
   * Process markdown content with dependency injection
   */
  async process(options: ProcessOptions): Promise<ProcessResult> {
    const state = this.prepare(options)

    // Execute onBeforeCompile hook if provided
    if (options.onBeforeCompile && options.currentFile) {
      try {
        const hookResult = await options.onBeforeCompile(state.hookContext)
        this.mergeHookResult(state, hookResult)
      } catch (error) {
        state.errors.push(hookFailureError(error))
      }
    }

    this.checkDynamicFields(state)

    // Schema validation using custom validateFrontmatter callback
    if (state.frontmatter.schema && options.validateFrontmatter) {
      const schemaName =
        typeof state.frontmatter.schema === 'string' ? state.frontmatter.schema : undefined
      const validationResult = await options.validateFrontmatter(state.frontmatter, schemaName)
      this.applySchemaResult(state, validationResult)
    }

    return this.finish(state, options)
  }

  /**
   * Synchronous variant of process(). The processing pipeline is fully
   * synchronous internally; the only difference is that onBeforeCompile and
   * validateFrontmatter hooks must return their results directly (a hook that
   * returns a Promise is reported as an error).
   */
  processSync(options: ProcessSyncOptions): ProcessResult {
    const state = this.prepare(options)

    if (options.onBeforeCompile && options.currentFile) {
      try {
        const hookResult = options.onBeforeCompile(state.hookContext)
        if (isThenable(hookResult)) {
          throw new Error('onBeforeCompile returned a Promise — use process() for async hooks')
        }
        this.mergeHookResult(state, hookResult)
      } catch (error) {
        state.errors.push(hookFailureError(error))
      }
    }

    this.checkDynamicFields(state)

    if (state.frontmatter.schema && options.validateFrontmatter) {
      const schemaName =
        typeof state.frontmatter.schema === 'string' ? state.frontmatter.schema : undefined
      const validationResult = options.validateFrontmatter(state.frontmatter, schemaName)
      if (isThenable(validationResult)) {
        state.errors.push({
          type: 'schema',
          message: 'validateFrontmatter returned a Promise — use process() for async validators',
          location: 'validateFrontmatter',
        })
      } else {
        this.applySchemaResult(state, validationResult)
      }
    }

    return this.finish(state, options)
  }

  /**
   * Validate markdown content without processing
   */
  async validate(options: Omit<ProcessOptions, 'mode'>): Promise<ProcessResult> {
    return this.process({ ...options, mode: 'validate' })
  }

  /**
   * First pipeline stage: extract frontmatter, assign file id, detect and
   * strip $dynamic placeholders
   */
  private prepare(options: ProcessOptions | ProcessSyncOptions): PipelineState {
    const context: ProcessingContext = {
      baseDir: options.baseDir,
      mode: options.mode || 'build',
      visitedFiles: new Set(),
      currentFile: options.currentFile,
      mustache: options.mustache,
      strict: options.strict,
    }

    // Extract and validate frontmatter
    const {
      frontmatter,
      body,
      errors: frontmatterErrors,
    } = this.frontmatterProcessor.extract(options.content)

    // Line offset of the body relative to the source file (frontmatter block)
    const bodyLineOffset = options.content.split('\n').length - body.split('\n').length

    // Generate and add file ID if currentFile is provided and id doesn't exist
    if (options.currentFile && !frontmatter.id) {
      frontmatter.id = generateFileId(options.currentFile, options.baseDir)
    }

    // Detect fields marked as $dynamic
    const dynamicFields: string[] = []
    for (const [key, value] of Object.entries(frontmatter)) {
      if (value === '$dynamic') {
        dynamicFields.push(key)
      }
    }

    // Snapshot frontmatter for the hook (including $dynamic markers), then
    // strip the placeholders so they can never render literally
    const hookContext: HookContext = {
      id: frontmatter.id || '',
      filePath: options.currentFile || '',
      frontmatter: { ...frontmatter },
      baseDir: options.baseDir,
      dynamicFields,
    }
    for (const field of dynamicFields) {
      delete frontmatter[field]
    }

    return {
      context,
      frontmatter,
      body,
      bodyLineOffset,
      errors: [...frontmatterErrors],
      dynamicFields,
      hookContext,
    }
  }

  /**
   * Deep merge a hook's result into the frontmatter
   */
  private mergeHookResult(state: PipelineState, hookResult: Record<string, unknown>): void {
    state.frontmatter = deepMerge(state.frontmatter, hookResult) as FrontmatterData
  }

  /**
   * Validate that every field originally marked $dynamic received a value —
   * from the onBeforeCompile hook, the variants API, or anything else. This
   * runs unconditionally: without a value the field is "not provided" and must
   * error rather than render the literal string "$dynamic".
   */
  private checkDynamicFields(state: PipelineState): void {
    // A hook may have echoed the literal "$dynamic" marker back; strip it
    // again so it can never render into output
    for (const field of state.dynamicFields) {
      if (state.frontmatter[field] === '$dynamic') {
        delete state.frontmatter[field]
      }
    }

    const missingDynamic = state.dynamicFields.filter(
      (field) => !(field in state.frontmatter) || state.frontmatter[field] === undefined,
    )

    if (missingDynamic.length > 0) {
      state.errors.push({
        type: 'schema',
        message: `These $dynamic fields were not provided: ${missingDynamic.join(', ')}. Provide values via onBeforeCompile hook or variants API`,
        location: 'frontmatter',
      })
    }
  }

  /**
   * Apply the result of a validateFrontmatter callback
   */
  private applySchemaResult(state: PipelineState, validationResult: SchemaValidationResult): void {
    if (!validationResult.valid && validationResult.errors) {
      // Convert simple string errors to ValidationError objects
      const schemaErrors = validationResult.errors.map((error) => ({
        type: 'schema' as const,
        message: error,
        location: state.context.currentFile || 'frontmatter',
      }))
      state.errors.push(...schemaErrors)
    } else if (validationResult.valid && validationResult.data) {
      // Update frontmatter with validated/transformed data if provided
      state.frontmatter = validationResult.data as FrontmatterData
    }
    // If valid but no data, keep original frontmatter
  }

  /**
   * Final pipeline stage: syntax validation, content processing, reassembly
   */
  private finish(
    state: PipelineState,
    options: ProcessOptions | ProcessSyncOptions,
  ): ProcessResult {
    const { context, body, bodyLineOffset, frontmatter } = state
    const allErrors = state.errors

    // Validate template syntax in content (source-relative line numbers)
    const syntaxValidationErrors = this.partialValidator.validate(body, {
      tags: context.mustache?.tags,
      lineOffset: bodyLineOffset,
    })
    allErrors.push(...syntaxValidationErrors)

    // Process content
    const resolver = new DependencyResolver(context)
    const processor = new ContentProcessor(resolver, this.frontmatterProcessor, context.mustache)
    const {
      processedContent,
      errors: processingErrors,
      dependencies,
    } = processor.process(body, frontmatter, context, bodyLineOffset)
    allErrors.push(...processingErrors)

    // Reassemble the document with processed frontmatter
    let finalContent: string
    try {
      finalContent = this.reassembleDocument(frontmatter, processedContent)
    } catch (error) {
      allErrors.push({
        type: 'frontmatter',
        message: `Failed to reassemble document: ${error}`,
        location: 'document',
      })
      finalContent = options.content // Return original content if reassembly fails
    }

    return {
      content: finalContent,
      frontmatter,
      errors: allErrors,
      dependencies,
    }
  }

  /**
   * Reassemble document with frontmatter and processed body
   */
  private reassembleDocument(frontmatter: FrontmatterData, body: string): string {
    // Filter frontmatter based on output-frontmatter field if present
    let outputFrontmatter: FrontmatterData = frontmatter

    if (frontmatter['output-frontmatter'] && Array.isArray(frontmatter['output-frontmatter'])) {
      const allowedFields = frontmatter['output-frontmatter']
      const filtered: Record<string, unknown> = {}

      // Only include fields that are in the output-frontmatter list
      for (const field of allowedFields) {
        // Don't include output-frontmatter itself
        if (field !== 'output-frontmatter' && Object.hasOwn(frontmatter, field)) {
          filtered[field] = frontmatter[field]
        }
      }

      outputFrontmatter = filtered as FrontmatterData
    }

    return matter.stringify(body, outputFrontmatter)
  }
}

function hookFailureError(error: unknown): ValidationError {
  return {
    type: 'schema',
    message: `Hook execution failed: ${error instanceof Error ? error.message : String(error)}`,
    location: 'onBeforeCompile',
  }
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

export * from './batch'
export * from './processor'
export * from './resolver'
export * from './strict'
// Export types and classes
export * from './types'
export * from './utils'
export * from './validator'
