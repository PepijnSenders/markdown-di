import { MarkdownDI } from '@markdown-di/core'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { glob } from 'fast-glob'
import chalk from 'chalk'

interface ValidateOptions {
  config?: string
}

export async function validateCommand(input: string, options: ValidateOptions) {
  console.log(chalk.blue('🔍 markdown-di validate\n'))

  // Initialize MarkdownDI
  const mdi = new MarkdownDI()

  // Determine files to process first to know where to look for config
  const files = await getInputFiles(input)

  if (files.length === 0) {
    console.log(chalk.red('✗ No markdown files found'))
    process.exit(1)
  }

  console.log(chalk.gray(`Validating ${files.length} file(s)...\n`))

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
    console.log(chalk.green(`✓ All ${successCount} file(s) are valid`))
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
