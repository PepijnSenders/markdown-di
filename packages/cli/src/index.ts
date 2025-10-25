#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type HookContext,
  MarkdownDI,
  type ValidationError,
} from "@markdown-di/core";
import chalk from "chalk";
import { globSync } from "fast-glob";
import ora from "ora";
import { z } from "zod";

export interface MarkdownDIConfig {
  /**
   * Base directory containing markdown files to format
   * @default process.cwd()
   */
  baseDir?: string;

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
   * Registered schemas for frontmatter validation
   * Key is the schema name (matches frontmatter.name field)
   */
  schemas?: Record<string, z.ZodObject<any>>;

  /**
   * Hook called before compilation to inject variables into frontmatter
   * @param context - Hook context with file ID, path, frontmatter, and baseDir
   * @returns Object to be deep merged into frontmatter
   */
  onBeforeCompile?: (
    context: HookContext
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;

  /**
   * Check mode - exits with error if files would change
   * @default false
   */
  check?: boolean;
}

async function loadConfig(): Promise<MarkdownDIConfig> {
  const configPaths = [
    "markdown-di.config.ts",
    "markdown-di.config.js",
    "markdown-di.config.mjs",
  ];

  for (const configPath of configPaths) {
    const fullPath = resolve(process.cwd(), configPath);
    if (existsSync(fullPath)) {
      try {
        const configUrl = pathToFileURL(fullPath).href;
        const configModule = await import(configUrl);
        return configModule.default || configModule;
      } catch (error) {
        throw new Error(`Failed to load config from ${configPath}: ${error}`);
      }
    }
  }

  throw new Error(
    "No markdown-di.config.ts file found. Please create one in your project root."
  );
}

async function run() {
  try {
    const config = await loadConfig();
    await formatMarkdown(config);
  } catch (error) {
    console.error(
      chalk.red("Error:"),
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

async function formatMarkdown(config: MarkdownDIConfig) {
  const spinner = ora("Formatting markdown files...").start();

  try {
    const baseDir = resolve(process.cwd(), config.baseDir || ".");
    const include = config.include || ["**/*.md"];
    const exclude = config.exclude || ["node_modules/**", ".git/**"];

    // Find all markdown files
    const files = globSync(include, {
      cwd: baseDir,
      absolute: true,
      ignore: exclude,
    });

    if (files.length === 0) {
      spinner.stop();
      console.log(chalk.yellow("No markdown files found"));
      return;
    }

    const mdi = new MarkdownDI();

    // Register schemas if provided
    if (config.schemas) {
      // biome-ignore lint/suspicious/noExplicitAny: Type compatibility with Zod v4
      mdi.registerSchemas(config.schemas as any);
    }

    const results: Array<{
      file: string;
      changed: boolean;
      errors: ValidationError[];
    }> = [];
    let errorCount = 0;
    let changedCount = 0;

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const relativePath = relative(baseDir, file);

      const result = await mdi.process({
        content,
        baseDir,
        currentFile: file,
        mode: "build",
        onBeforeCompile: config.onBeforeCompile,
      });

      const changed = result.content !== content;
      if (changed) changedCount++;

      errorCount += result.errors.length;

      results.push({
        file: relativePath,
        changed,
        errors: result.errors,
      });

      // Write formatted content if not in check mode and content changed
      if (!config.check && changed && result.errors.length === 0) {
        writeFileSync(file, result.content);
      }
    }

    spinner.stop();

    // Report results
    if (errorCount > 0) {
      console.log(
        chalk.red(`✗ Found ${errorCount} errors in ${files.length} files`)
      );
      results.forEach((result) => {
        if (result.errors.length > 0) {
          console.log(chalk.yellow(`\n${result.file}:`));
          result.errors.forEach((error) => {
            console.log(
              `  ${error.type}: ${error.message} at ${error.location}`
            );
          });
        }
      });
      process.exit(1);
    } else if (config.check && changedCount > 0) {
      console.log(chalk.yellow(`${changedCount} file(s) would be formatted`));
      results.forEach((result) => {
        if (result.changed) {
          console.log(`  ${result.file}`);
        }
      });
      process.exit(1);
    } else if (changedCount > 0) {
      console.log(chalk.green(`✓ Formatted ${changedCount} file(s)`));
    } else {
      console.log(
        chalk.green(`✓ All ${files.length} files are correctly formatted`)
      );
    }
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

run();
