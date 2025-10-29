import { MarkdownDI } from '@markdown-di/core'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { glob } from 'fast-glob'
import chalk from 'chalk'

interface BuildOptions {
  output?: string
  config?: string
  watch?: boolean
}

export async function buildCommand(input: string, options: BuildOptions) {
  console.log(chalk.blue('🔨 markdown-di build\n'))

  // Initialize MarkdownDI
  const mdi = new MarkdownDI()

  // Determine files to process first to know where to look for config
  const files = await getInputFiles(input)

  if (files.length === 0) {
    console.log(chalk.red('✗ No markdown files found'))
    process.exit(1)
  }

  console.log(chalk.gray(`Processing ${files.length} file(s)...\n`))

  let successCount = 0
  let errorCount = 0

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8')
      const result = await mdi.process({
        content,
        baseDir: dirname(file),
        currentFile: file,
      })

      if (result.errors.length > 0) {
        console.log(chalk.red(`✗ ${file}`))
        result.errors.forEach((err) => {
          console.log(chalk.gray(`  ${err.location}: ${err.message}`))
        })
        errorCount++
      } else {
        console.log(chalk.green(`✓ ${file}`))
        successCount++

        // Write output if specified
        if (options.output) {
          const outPath = getOutputPath(file, input, options.output)
          ensureDirectoryExists(dirname(outPath))
          writeFileSync(outPath, result.content, 'utf-8')
        }
      }
    } catch (err) {
      console.log(chalk.red(`✗ ${file}`))
      console.log(
        chalk.gray(`  ${err instanceof Error ? err.message : String(err)}`),
      )
      errorCount++
    }
  }

  // Summary
  console.log()
  if (errorCount > 0) {
    console.log(
      chalk.red(`✗ ${errorCount} file(s) with errors, ${successCount} succeeded`),
    )
    process.exit(1)
  } else {
    console.log(chalk.green(`✓ All ${successCount} file(s) processed successfully`))
    if (options.output) {
      console.log(chalk.gray(`Output: ${options.output}`))
    }
  }
}

async function getInputFiles(input: string): Promise<string[]> {
  // Check if it's a single file
  if (input.endsWith('.md') && existsSync(input)) {
    return [input]
  }

  // Treat as directory pattern
  const pattern = input.endsWith('.md')
    ? input
    : join(input, '**/*.md').replace(/\\/g, '/')

  const files = await glob(pattern, {
    absolute: true,
    onlyFiles: true,
  })

  return files.sort()
}

function getOutputPath(filePath: string, inputBase: string, outputBase: string): string {
  // If input is a single file, output to output directory with same name
  if (inputBase.endsWith('.md')) {
    return join(outputBase, filePath.split('/').pop() || 'output.md')
  }

  // Calculate relative path from input directory
  const rel = relative(inputBase, filePath)
  return join(outputBase, rel)
}

function ensureDirectoryExists(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}
