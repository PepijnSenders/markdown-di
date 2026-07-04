#!/usr/bin/env bun

import { relative, resolve } from 'node:path'
import { typegen } from './typegen'

const USAGE = `Usage: markdown-di-typegen [patterns...] [options]

Generate sibling .d.md.ts declaration files for markdown-di prompt files, so
Bun .md imports are typed (requires "allowArbitraryExtensions": true in the
consuming tsconfig).

Options:
  --cwd <dir>           Directory to resolve patterns from (default: current directory)
  --single-file <path>  Emit ONE declaration file at <path> (resolved against --cwd)
                        containing a wildcard ambient module block per template,
                        instead of sibling .d.md.ts files. Template basenames must
                        be unique and no basename may be a proper suffix of another.
  --include-fallback    With --single-file: append the generic *.md / *.markdown
                        fallback blocks after the per-template blocks
  -h, --help            Show this help

Examples:
  markdown-di-typegen "prompts/**/*.md"
  markdown-di-typegen "src/**/*.md" --cwd packages/app
  markdown-di-typegen "prompts/**/*.md" --single-file types/prompts.d.ts
`

function main(argv: string[]): number {
  const patterns: string[] = []
  let cwd = process.cwd()
  let singleFile: string | undefined
  let includeFallback = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      console.log(USAGE)
      return 0
    }
    if (arg === '--cwd') {
      const value = argv[++i]
      if (!value) {
        console.error('--cwd requires a directory')
        return 1
      }
      cwd = resolve(value)
    } else if (arg === '--single-file') {
      const value = argv[++i]
      if (!value) {
        console.error('--single-file requires a path')
        return 1
      }
      singleFile = value
    } else if (arg === '--include-fallback') {
      includeFallback = true
    } else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`)
      return 1
    } else {
      patterns.push(arg)
    }
  }

  if (includeFallback && singleFile === undefined) {
    console.error('--include-fallback requires --single-file')
    return 1
  }

  if (patterns.length === 0) patterns.push('**/*.md')

  try {
    const entries = typegen(patterns, { cwd, singleFile, includeFallback })
    if (entries.length === 0) {
      console.warn(`No markdown files matched: ${patterns.join(', ')}`)
    } else if (singleFile !== undefined) {
      console.log(`  ${relative(cwd, entries[0].declarationFile)}`)
      console.log(`Generated 1 declaration file covering ${entries.length} template(s)`)
    } else {
      for (const entry of entries) {
        console.log(`  ${relative(cwd, entry.declarationFile)}`)
      }
      console.log(`Generated ${entries.length} declaration file(s)`)
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

process.exit(main(process.argv.slice(2)))
