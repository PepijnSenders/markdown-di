#!/usr/bin/env node

import { Command } from 'commander';
import { MarkdownDI, MarkdownDISchema } from '@markdown-di/core';
import { z } from 'zod';
import chalk from 'chalk';
import ora from 'ora';
import { watch } from 'chokidar';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, relative, resolve } from 'path';

const program = new Command();

program
  .name('markdown-di')
  .description('Type-safe dependency injection for markdown using frontmatter')
  .version('0.0.0');

// Build command
program
  .command('build')
  .description('Build markdown files with dependency injection')
  .option('-i, --input <path>', 'Input directory or file', './src')
  .option('-o, --output <path>', 'Output directory', './dist')
  .option('-w, --watch', 'Watch mode for development')
  .option('--validate-only', 'Only validate without building')
  .option('--schema <file>', 'Schema validation file (JavaScript/TypeScript)')
  .option('--config <file>', 'Configuration file with schema registrations', './markdown-di.config.js')
  .option('--schema-extend', 'Extend default schema with custom schema')
  .option('--schema-strict', 'Strict schema validation (no additional properties)')
  .action(async (options) => {
    try {
      if (options.watch) {
        await watchAndBuild(options.input, options.output, options.validateOnly, options);
      } else {
        await build(options.input, options.output, options.validateOnly, options);
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate markdown files for dependency injection errors')
  .argument('<path>', 'Path to file or directory to validate')
  .option('--json', 'Output validation results as JSON')
  .option('--schema <file>', 'Schema validation file (JavaScript/TypeScript)')
  .option('--schema-extend', 'Extend default schema with custom schema')
  .option('--schema-strict', 'Strict schema validation (no additional properties)')
  .action(async (path, options) => {
    try {
      const results = await validate(path, options.json);
      if (!options.json) {
        if (results.every(r => r.errors.length === 0)) {
          console.log(chalk.green('✓ All files validated successfully'));
        } else {
          console.log(chalk.red('✗ Validation errors found'));
          results.forEach(result => {
            if (result.errors.length > 0) {
              console.log(chalk.yellow(`\n${result.file}:`));
              result.errors.forEach(error => {
                console.log(`  ${error.type}: ${error.message} at ${error.location}`);
              });
            }
          });
          process.exit(1);
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Init command
program
  .command('init')
  .description('Initialize a new markdown-di project')
  .option('-d, --dir <path>', 'Directory to initialize', '.')
  .action(async (options) => {
    try {
      await initProject(options.dir);
      console.log(chalk.green('✓ Project initialized successfully'));
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Schema command
program
  .command('schema')
  .description('Schema validation and type generation utilities')
  .argument('<action>', 'Action to perform (validate|generate-type)')
  .option('-s, --schema <file>', 'Schema file (JavaScript/TypeScript)')
  .option('-i, --input <path>', 'Input directory or file (for validation)', './src')
  .option('--json', 'Output validation results as JSON')
  .option('-o, --output <file>', 'Output file path (for type generation)')
  .option('--type-name <name>', 'Type name for generated TypeScript types', 'Frontmatter')
  .option('--schema-extend', 'Extend default schema with custom schema')
  .option('--schema-strict', 'Strict schema validation (no additional properties)')
  .action(async (action, options) => {
    try {
      await handleSchemaCommand(action, options);
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

async function build(input: string, output: string, validateOnly: boolean = false, options?: any) {
  const spinner = ora('Building markdown files...').start();

  try {
    // Load configuration and register schemas
    const schemas = await loadConfiguration(options?.config);

    const files = await getMarkdownFiles(input);
    const results: Array<{ file: string; errors: any[] }> = [];

    for (const file of files) {
      const schemaOptions = options?.schema ? {
        schema: await loadSchemaFile(options.schema),
        extend: options.schemaExtend,
        strict: options.schemaStrict
      } : undefined;

      const result = await processFile(file, input, output, validateOnly, schemaOptions, schemas);
      results.push(result);
    }

    spinner.stop();

    // Report results
    const errorCount = results.reduce((count, r) => count + r.errors.length, 0);
    if (errorCount === 0) {
      console.log(chalk.green(`✓ Built ${files.length} files successfully`));
    } else {
      console.log(chalk.red(`✗ Built ${files.length} files with ${errorCount} errors`));
      results.forEach(result => {
        if (result.errors.length > 0) {
          console.log(chalk.yellow(`\n${result.file}:`));
          result.errors.forEach(error => {
            console.log(`  ${error.type}: ${error.message} at ${error.location}`);
          });
        }
      });
      process.exit(1);
    }
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

async function watchAndBuild(input: string, output: string, validateOnly: boolean = false, options?: any) {
  console.log(chalk.blue(`Watching ${input} for changes...`));

  // Initial build
  await build(input, output, validateOnly);

  // Set up watcher
  const watcher = watch(input, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true
  });

  watcher.on('change', async (path) => {
    if (path.endsWith('.md')) {
      console.log(chalk.blue(`\nFile changed: ${path}`));
      try {
        await build(input, output, validateOnly);
      } catch (error: any) {
        console.error(chalk.red('Build failed:'), error.message);
      }
    }
  });

  watcher.on('add', async (path) => {
    if (path.endsWith('.md')) {
      console.log(chalk.blue(`\nFile added: ${path}`));
      try {
        await build(input, output, validateOnly);
      } catch (error: any) {
        console.error(chalk.red('Build failed:'), error.message);
      }
    }
  });

  watcher.on('unlink', async (path) => {
    if (path.endsWith('.md')) {
      console.log(chalk.blue(`\nFile removed: ${path}`));
      try {
        await build(input, output, validateOnly);
      } catch (error: any) {
        console.error(chalk.red('Build failed:'), error.message);
      }
    }
  });
}

async function validate(path: string, json: boolean = false, schemaOptions?: any) {
  const spinner = ora('Validating markdown files...').start();

  try {
    const files = await getMarkdownFiles(path);
    const results: Array<{ file: string; errors: any[] }> = [];

    for (const file of files) {
      const result = await processFile(file, path, null, true, schemaOptions);
      results.push(result);
    }

    spinner.stop();

    if (json) {
      console.log(JSON.stringify(results, null, 2));
    }

    return results;
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

async function initProject(dir: string) {
  const configPath = join(dir, 'markdown-di.config.js');
  const configContent = `
module.exports = {
  input: './src',
  output: './dist',
  remark: {
    baseDir: './src',
    headingShift: true,
    linkRewrite: true
  },
  watch: {
    ignore: ['node_modules/**', 'dist/**']
  }
};
`;

  writeFileSync(configPath, configContent.trim());

  // Create example file
  const exampleDir = join(dir, 'src', 'examples');
  if (!existsSync(exampleDir)) {
    mkdirSync(exampleDir, { recursive: true });
  }

  const exampleContent = `---
name: example-document
description: Example document demonstrating markdown-di

blueprints:
  sections:
    intro: sections/intro.md
    conclusion: sections/conclusion.md

references:
  guides:
    - guides/*.md
---

# Example Document

{{sections.intro}}

## Main Content

This is the main content of the document. Notice how we use semantic references like \`{{sections.intro}}\` instead of file paths.

{{sections.conclusion}}

## Related Guides

{{references.guides}}
`;

  const examplePath = join(exampleDir, 'example.md');
  writeFileSync(examplePath, exampleContent);

  // Create example sections
  const sectionsDir = join(dir, 'src', 'sections');
  if (!existsSync(sectionsDir)) {
    mkdirSync(sectionsDir, { recursive: true });
  }

  writeFileSync(join(sectionsDir, 'intro.md'), '# Introduction\n\nThis is the introduction section.\n');
  writeFileSync(join(sectionsDir, 'conclusion.md'), '# Conclusion\n\nThis is the conclusion section.\n');

  // Create example guides
  const guidesDir = join(dir, 'src', 'guides');
  if (!existsSync(guidesDir)) {
    mkdirSync(guidesDir, { recursive: true });
  }

  writeFileSync(join(guidesDir, 'getting-started.md'), '# Getting Started\n\nGetting started guide.\n');
  writeFileSync(join(guidesDir, 'advanced-usage.md'), '# Advanced Usage\n\nAdvanced usage guide.\n');
}

async function getMarkdownFiles(path: string): Promise<string[]> {
  const { globSync } = await import('fast-glob');
  const files = globSync(`${path}/**/*.md`, {
    absolute: true,
    onlyFiles: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
  });
  return files;
}

async function processFile(
  filePath: string,
  baseDir: string,
  outputDir: string | null,
  validateOnly: boolean,
  schemaOptions?: any,
  schemas?: Record<string, any>
): Promise<{ file: string; errors: any[] }> {
  const mdi = new MarkdownDI();
  const content = readFileSync(filePath, 'utf-8');
  const relativePath = relative(baseDir, filePath);

  const processOptions: any = {
    content,
    baseDir: baseDir,
    currentFile: filePath,
    mode: validateOnly ? 'validate' : 'build'
  };

  if (schemaOptions) {
    processOptions.schema = schemaOptions;
  }

  if (schemas) {
    processOptions.schemas = schemas;
  }

  const result = await mdi.process(processOptions);

  if (!validateOnly && outputDir) {
    // Write processed file
    const outputPath = join(outputDir, relativePath);
    const outputDirPath = dirname(outputPath);

    if (!existsSync(outputDirPath)) {
      mkdirSync(outputDirPath, { recursive: true });
    }

    writeFileSync(outputPath, result.content);
  }

  return {
    file: relativePath,
    errors: result.errors
  };
}

async function handleSchemaCommand(action: string, options: any) {
  try {
    // Load schema file
    let schema;
    if (options.schema) {
      const schemaPath = resolve(process.cwd(), options.schema);
      if (!existsSync(schemaPath)) {
        throw new Error(`Schema file not found: ${schemaPath}`);
      }

      const schemaContent = readFileSync(schemaPath, 'utf-8');
      // Handle both CommonJS and ES modules
      try {
        // Try to import as ES module first
        const schemaModule = await import(schemaPath);
        schema = schemaModule.default || schemaModule.schema || schemaModule;
      } catch (importError) {
        try {
          // Fallback to CommonJS evaluation
          schema = eval(`(function() { ${schemaContent}; return module?.exports || exports || globalThis.schema || {}; })()`);
        } catch (evalError) {
          throw new Error(`Could not load schema file. Make sure it exports a valid schema object.`);
        }
      }
    } else if (action === 'validate') {
      throw new Error('Schema file is required for validation');
    }

    switch (action) {
      case 'validate':
        await validateWithSchema(options.input, schema, options);
        break;
      case 'generate-type':
        await generateTypeFromSchema(schema, options);
        break;
      default:
        throw new Error(`Unknown schema action: ${action}. Valid actions are: validate, generate-type`);
    }
  } catch (error: any) {
    console.error(chalk.red('Schema Error:'), error.message);
    process.exit(1);
  }
}

async function validateWithSchema(inputPath: string, schema: any, options: any) {
  const spinner = ora('Validating with schema...').start();

  try {
    const files = await getMarkdownFiles(inputPath);
    let errorCount = 0;
    const results: Array<{ file: string; errors: any[] }> = [];

    for (const file of files) {
      const mdi = new MarkdownDI();
      const content = readFileSync(file, 'utf-8');

      const schemaOptions = {
        schema: schema,
        extend: options.schemaExtend,
        strict: options.schemaStrict
      };

      const result = await mdi.process({
        content,
        baseDir: inputPath,
        currentFile: file,
        mode: 'validate',
        schema: schemaOptions
      });

      results.push({
        file: relative(inputPath, file),
        errors: result.errors
      });

      errorCount += result.errors.length;
    }

    spinner.stop();

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      if (errorCount === 0) {
        console.log(chalk.green(`✓ All ${files.length} files validated successfully with schema`));
      } else {
        console.log(chalk.red(`✗ Found ${errorCount} schema validation errors across ${files.length} files`));
        results.forEach(result => {
          if (result.errors.length > 0) {
            console.log(chalk.yellow(`\n${result.file}:`));
            result.errors.forEach(error => {
              console.log(`  ${error.type}: ${error.message} at ${error.location}`);
            });
          }
        });
        process.exit(1);
      }
    }
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

async function generateTypeFromSchema(schema: any, options: any) {
  const spinner = ora('Generating TypeScript type...').start();

  try {
    const typeName = options.typeName || 'Frontmatter';

    // Create a temporary SchemaValidator instance
    const schemaValidator = MarkdownDISchema.create(schema, {
      extend: options.schemaExtend,
      strict: options.schemaStrict
    });

    const typeDefinition = schemaValidator.generateType(schema, typeName);

    spinner.stop();

    if (options.output) {
      const outputPath = resolve(process.cwd(), options.output);
      writeFileSync(outputPath, typeDefinition, 'utf-8');
      console.log(chalk.green(`✓ TypeScript type definition saved to: ${outputPath}`));
    } else {
      console.log('\n' + typeDefinition);
    }
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

async function loadConfiguration(configPath: string = './markdown-di.config.js'): Promise<Record<string, any> | undefined> {
  try {
    const fullPath = resolve(process.cwd(), configPath);
    if (!existsSync(fullPath)) {
      return undefined;
    }

    const configContent = readFileSync(fullPath, 'utf-8');

    // Try to load as ES module first
    try {
      const configModule = await import(fullPath);
      const config = configModule.default || configModule.config || configModule;

      // Extract schemas if present
      if (config.schemas) {
        return config.schemas;
      }
    } catch (importError) {
      // Fallback to CommonJS evaluation
      try {
        const config = eval(`(function() { ${configContent}; return module?.exports || exports || globalThis.config || {}; })()`);

        if (config.schemas) {
          return config.schemas;
        }
      } catch (evalError) {
        // No schemas found, continue
      }
    }

    return undefined;
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Could not load configuration from ${configPath}: ${error instanceof Error ? error.message : String(error)}`));
    return undefined;
  }
}

async function loadSchemaFile(schemaPath: string): Promise<any> {
  const fullPath = resolve(process.cwd(), schemaPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Schema file not found: ${fullPath}`);
  }

  const schemaContent = readFileSync(fullPath, 'utf-8');

  // Try to import as ES module first
  try {
    const schemaModule = await import(fullPath);
    return schemaModule.default || schemaModule.schema || schemaModule;
  } catch (importError) {
    // Fallback to CommonJS evaluation
    try {
      return eval(`(function() { ${schemaContent}; return module?.exports || exports || globalThis.schema || {}; })()`);
    } catch (evalError) {
      throw new Error(`Could not load schema file. Make sure it exports a valid schema object.`);
    }
  }
}

export { program };