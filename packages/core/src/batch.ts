import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { globSync } from 'fast-glob'
import { MarkdownDI } from './index'
import { FrontmatterProcessor } from './processor'
import type { ProcessOptions, ValidationError } from './types'
import { generateFileId } from './utils'

/**
 * Batch processing configuration
 * Extends ProcessOptions with batch-specific options
 */
export interface BatchConfig
  extends Pick<
    ProcessOptions,
    'baseDir' | 'onBeforeCompile' | 'variants' | 'mustache' | 'validateFrontmatter' | 'strict'
  > {
  /**
   * Glob patterns to match markdown files
   * @default ['**\/*.md']
   */
  include?: string[]

  /**
   * Glob patterns to exclude
   * @default ['node_modules/**', '.git/**']
   */
  exclude?: string[]

  /**
   * Output directory for processed files
   * If not provided, files are updated in place
   */
  outDir?: string

  /**
   * Check mode - returns results without writing files
   * @default false
   */
  check?: boolean

  /**
   * Silent mode - suppress console output
   * @default false
   */
  silent?: boolean
}

/**
 * Result for a single file
 */
export interface FileResult {
  file: string
  changed: boolean
  errors: ValidationError[]
  /**
   * Simple error messages for easy access
   */
  messages: string[]
}

/**
 * Batch processing result
 */
export interface BatchResult {
  /**
   * Total number of files processed
   */
  totalFiles: number

  /**
   * Number of files that changed
   */
  changedFiles: number

  /**
   * Total number of errors across all files
   */
  totalErrors: number

  /**
   * Results for each processed file
   */
  files: FileResult[]

  /**
   * Whether the batch processing succeeded (no errors)
   */
  success: boolean

  /**
   * All errors grouped by file for easy access
   * Only includes files with errors
   */
  errorsByFile: Record<string, ValidationError[]>

  /**
   * All errors flattened into a single array for easy access
   */
  allErrors: ValidationError[]

  /**
   * All error messages as simple strings for easy access
   */
  errorMessages: string[]
}

/**
 * Batch processor for multiple markdown files
 */
export class BatchProcessor {
  private mdi: MarkdownDI
  private frontmatterProcessor = new FrontmatterProcessor()
  private config: Required<
    Omit<
      BatchConfig,
      'onBeforeCompile' | 'outDir' | 'variants' | 'mustache' | 'validateFrontmatter' | 'strict'
    >
  > & {
    outDir?: string
    onBeforeCompile?: BatchConfig['onBeforeCompile']
    variants?: BatchConfig['variants']
    mustache?: BatchConfig['mustache']
    validateFrontmatter?: BatchConfig['validateFrontmatter']
    strict?: BatchConfig['strict']
  }

  constructor(config: BatchConfig) {
    this.mdi = new MarkdownDI()
    this.config = {
      baseDir: resolve(config.baseDir),
      include: config.include || ['**/*.md'],
      exclude: config.exclude || ['node_modules/**', '.git/**'],
      outDir: config.outDir ? resolve(config.outDir) : undefined,
      check: config.check || false,
      silent: config.silent || false,
      onBeforeCompile: config.onBeforeCompile,
      variants: config.variants,
      mustache: config.mustache,
      validateFrontmatter: config.validateFrontmatter,
      strict: config.strict,
    }
  }

  /**
   * Process all matching markdown files
   */
  async process(): Promise<BatchResult> {
    const { baseDir, include, exclude, outDir, check, silent, variants } = this.config

    // Find all markdown files
    const files = globSync(include, {
      cwd: baseDir,
      absolute: true,
      ignore: exclude,
    })

    if (files.length === 0) {
      if (!silent) {
        console.warn('No markdown files found')
      }
      return {
        totalFiles: 0,
        changedFiles: 0,
        totalErrors: 0,
        files: [],
        success: true,
        errorsByFile: {},
        allErrors: [],
        errorMessages: [],
      }
    }

    const results: FileResult[] = []
    let changedCount = 0
    let errorCount = 0

    // Track every output path claimed by this batch so collisions (two
    // variants — or a variant and a regular file — mapping to the same output)
    // error instead of silently overwriting each other.
    const claimedOutputs = new Map<string, string>()
    const claimOutput = (outputPath: string, source: string): ValidationError | null => {
      const normalized = resolve(outputPath)
      const existing = claimedOutputs.get(normalized)
      if (existing) {
        return {
          type: 'file',
          message: `Output path collision: "${relative(baseDir, normalized)}" is produced by both ${existing} and ${source}`,
          location: source,
        }
      }
      claimedOutputs.set(normalized, source)
      return null
    }

    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      const relativePath = relative(baseDir, file)

      // Cheap first pass: extract frontmatter only, to detect whether this
      // file has variants configured (matched by file id)
      const { frontmatter: rawFrontmatter } = this.frontmatterProcessor.extract(content)
      const fileId =
        (typeof rawFrontmatter.id === 'string' && rawFrontmatter.id) ||
        generateFileId(file, baseDir)
      const variantConfig = variants ? variants[fileId] : undefined

      if (variantConfig) {
        // This file has variants - process each variant instead of the original
        for (let i = 0; i < variantConfig.data.length; i++) {
          const variantData = variantConfig.data[i]

          // Re-process the file with variant data
          const variantResult = await this.mdi.process({
            content,
            baseDir,
            currentFile: file,
            mode: 'build',
            onBeforeCompile: async (context) => {
              // Merge variant data with any onBeforeCompile results
              const baseData = this.config.onBeforeCompile
                ? await this.config.onBeforeCompile(context)
                : {}
              return { ...baseData, ...variantData }
            },
            mustache: this.config.mustache,
            validateFrontmatter: this.config.validateFrontmatter,
            strict: this.config.strict,
          })

          const variantErrors = [...variantResult.errors]

          // Get output path from callback
          const variantOutputPath = variantConfig.getOutputPath(
            {
              id: fileId,
              filePath: file,
              frontmatter: variantResult.frontmatter as Record<string, unknown>,
              baseDir,
              dynamicFields: [],
            },
            variantData,
            i,
          )

          const fullOutputPath = outDir
            ? join(outDir, variantOutputPath)
            : join(baseDir, variantOutputPath)

          const collisionError = claimOutput(fullOutputPath, `${relativePath} (variant ${i})`)
          if (collisionError) {
            variantErrors.push(collisionError)
          }

          const variantChanged = variantResult.content !== content
          if (variantChanged) changedCount++
          errorCount += variantErrors.length

          results.push({
            file: variantOutputPath,
            changed: variantChanged,
            errors: variantErrors,
            messages: variantErrors.map((e) => e.message),
          })

          // Write variant file if not in check mode and no errors
          if (!check && variantChanged && variantErrors.length === 0) {
            const outputDir = dirname(fullOutputPath)
            if (!existsSync(outputDir)) {
              mkdirSync(outputDir, { recursive: true })
            }

            writeFileSync(fullOutputPath, variantResult.content, 'utf-8')
          }
        }
      } else {
        // Normal file processing (no variants) - full check, including $dynamic
        const result = await this.mdi.process({
          content,
          baseDir,
          currentFile: file,
          mode: 'build',
          onBeforeCompile: this.config.onBeforeCompile,
          mustache: this.config.mustache,
          validateFrontmatter: this.config.validateFrontmatter,
          strict: this.config.strict,
        })

        const fileErrors = [...result.errors]
        const outputPath = outDir ? join(outDir, relativePath) : file

        const collisionError = claimOutput(outputPath, relativePath)
        if (collisionError) {
          fileErrors.push(collisionError)
        }

        const changed = result.content !== content
        if (changed) changedCount++
        errorCount += fileErrors.length

        results.push({
          file: relativePath,
          changed,
          errors: fileErrors,
          messages: fileErrors.map((e) => e.message),
        })

        // Write files only if:
        // 1. Not in check mode
        // 2. Content changed
        // 3. No validation errors
        if (!check && changed && fileErrors.length === 0) {
          // Create output directory if needed
          const outputDir = dirname(outputPath)
          if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true })
          }

          writeFileSync(outputPath, result.content, 'utf-8')
        }
      }
    }

    // Build error aggregations for easy access
    const errorsByFile: Record<string, ValidationError[]> = {}
    const allErrors: ValidationError[] = []
    const errorMessages: string[] = []

    for (const result of results) {
      if (result.errors.length > 0) {
        errorsByFile[result.file] = result.errors
        allErrors.push(...result.errors)
        errorMessages.push(...result.messages)
      }
    }

    const batchResult: BatchResult = {
      totalFiles: files.length,
      changedFiles: changedCount,
      totalErrors: errorCount,
      files: results,
      success: errorCount === 0,
      errorsByFile,
      allErrors,
      errorMessages,
    }

    // Log results if not silent
    if (!silent) {
      this.logResults(batchResult)
    }

    return batchResult
  }

  /**
   * Log processing results to console
   */
  private logResults(result: BatchResult): void {
    const { totalFiles, changedFiles, totalErrors, files } = result

    if (totalErrors > 0) {
      console.error(`✗ Found ${totalErrors} errors in ${totalFiles} files`)
    } else if (this.config.check && changedFiles > 0) {
      console.warn(`${changedFiles} file(s) would be formatted`)
      files.forEach((fileResult) => {
        if (fileResult.changed) {
          console.log(`  ${fileResult.file}`)
        }
      })
    } else if (changedFiles > 0) {
      console.log(`✓ Formatted ${changedFiles} file(s)`)
      if (this.config.outDir) {
        console.log(`  Output: ${this.config.outDir}`)
      }
    } else {
      console.log(`✓ All ${totalFiles} files are correctly formatted`)
    }
  }
}
