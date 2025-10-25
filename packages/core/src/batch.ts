import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { globSync } from "fast-glob";
import type { ProcessOptions, ValidationError } from "./types";
import { MarkdownDI } from "./index";
import { z } from "zod";

/**
 * Batch processing configuration
 * Extends ProcessOptions with batch-specific options
 */
export interface BatchConfig extends Pick<ProcessOptions, 'baseDir' | 'onBeforeCompile'> {
  /**
   * Glob patterns to match markdown files
   * @default ['**\/*.md']
   */
  include?: string[];

  /**
   * Glob patterns to exclude
   * @default ['node_modules/**', '.git/**']
   */
  exclude?: string[];

  /**
   * Output directory for processed files
   * If not provided, files are updated in place
   */
  outDir?: string;

  /**
   * Registered schemas for frontmatter validation
   * Key is the schema name (matches frontmatter.schema field)
   */
  schemas?: Record<string, z.ZodObject<any>>;

  /**
   * Check mode - returns results without writing files
   * @default false
   */
  check?: boolean;

  /**
   * Silent mode - suppress console output
   * @default false
   */
  silent?: boolean;
}

/**
 * Result for a single file
 */
export interface FileResult {
  file: string;
  changed: boolean;
  errors: ValidationError[];
}

/**
 * Batch processing result
 */
export interface BatchResult {
  /**
   * Total number of files processed
   */
  totalFiles: number;

  /**
   * Number of files that changed
   */
  changedFiles: number;

  /**
   * Total number of errors across all files
   */
  totalErrors: number;

  /**
   * Results for each processed file
   */
  files: FileResult[];

  /**
   * Whether the batch processing succeeded (no errors)
   */
  success: boolean;
}

/**
 * Batch processor for multiple markdown files
 */
export class BatchProcessor {
  private mdi: MarkdownDI;
  private config: Required<
    Omit<BatchConfig, "schemas" | "onBeforeCompile" | "outDir">
  > & {
    outDir?: string;
    onBeforeCompile?: BatchConfig["onBeforeCompile"];
  };

  constructor(config: BatchConfig) {
    this.mdi = new MarkdownDI();
    this.config = {
      baseDir: resolve(config.baseDir),
      include: config.include || ["**/*.md"],
      exclude: config.exclude || ["node_modules/**", ".git/**"],
      outDir: config.outDir ? resolve(config.outDir) : undefined,
      check: config.check || false,
      silent: config.silent || false,
      onBeforeCompile: config.onBeforeCompile,
    };

    // Register schemas if provided
    if (config.schemas) {
      this.mdi.registerSchemas(config.schemas);
    }
  }

  /**
   * Process all matching markdown files
   */
  async process(): Promise<BatchResult> {
    const { baseDir, include, exclude, outDir, check, silent } = this.config;

    // Find all markdown files
    const files = globSync(include, {
      cwd: baseDir,
      absolute: true,
      ignore: exclude,
    });

    if (files.length === 0) {
      if (!silent) {
        console.warn("No markdown files found");
      }
      return {
        totalFiles: 0,
        changedFiles: 0,
        totalErrors: 0,
        files: [],
        success: true,
      };
    }

    const results: FileResult[] = [];
    let changedCount = 0;
    let errorCount = 0;

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const relativePath = relative(baseDir, file);

      const result = await this.mdi.process({
        content,
        baseDir,
        currentFile: file,
        mode: "build",
        onBeforeCompile: this.config.onBeforeCompile,
      });

      const changed = result.content !== content;
      if (changed) changedCount++;
      errorCount += result.errors.length;

      results.push({
        file: relativePath,
        changed,
        errors: result.errors,
      });

      // Write files only if:
      // 1. Not in check mode
      // 2. Content changed
      // 3. No validation errors
      if (!check && changed && result.errors.length === 0) {
        const outputPath = outDir ? join(outDir, relativePath) : file;

        // Create output directory if needed
        const outputDir = dirname(outputPath);
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }

        writeFileSync(outputPath, result.content, "utf-8");
      }
    }

    const batchResult: BatchResult = {
      totalFiles: files.length,
      changedFiles: changedCount,
      totalErrors: errorCount,
      files: results,
      success: errorCount === 0,
    };

    // Log results if not silent
    if (!silent) {
      this.logResults(batchResult);
    }

    return batchResult;
  }

  /**
   * Log processing results to console
   */
  private logResults(result: BatchResult): void {
    const { totalFiles, changedFiles, totalErrors, files } = result;

    if (totalErrors > 0) {
      console.error(`✗ Found ${totalErrors} errors in ${totalFiles} files`);
      files.forEach((fileResult) => {
        if (fileResult.errors.length > 0) {
          console.error(`\n${fileResult.file}:`);
          fileResult.errors.forEach((error) => {
            console.error(`  ${error.type}: ${error.message} at ${error.location}`);
          });
        }
      });
    } else if (this.config.check && changedFiles > 0) {
      console.warn(`${changedFiles} file(s) would be formatted`);
      files.forEach((fileResult) => {
        if (fileResult.changed) {
          console.log(`  ${fileResult.file}`);
        }
      });
    } else if (changedFiles > 0) {
      console.log(`✓ Formatted ${changedFiles} file(s)`);
      if (this.config.outDir) {
        console.log(`  Output: ${this.config.outDir}`);
      }
    } else {
      console.log(`✓ All ${totalFiles} files are correctly formatted`);
    }
  }

  /**
   * Register a schema for validation
   */
  registerSchema(name: string, schema: z.ZodObject<any>): void {
    this.mdi.registerSchema(name, schema);
  }

  /**
   * Register multiple schemas
   */
  registerSchemas(schemas: Record<string, z.ZodObject<any>>): void {
    this.mdi.registerSchemas(schemas);
  }
}
