#!/usr/bin/env bun

import { relative, resolve } from 'node:path'
import { typegen } from './typegen'

const USAGE = `Usage: markdown-di-typegen [patterns...] [options]

Generate sibling .d.md.ts declaration files for markdown-di prompt files, so
Bun .md imports are typed (requires "allowArbitraryExtensions": true in the
consuming tsconfig).

Options:
  --cwd <dir>   Directory to resolve patterns from (default: current directory)
  -h, --help    Show this help

Examples:
  markdown-di-typegen "prompts/**/*.md"
  markdown-di-typegen "src/**/*.md" --cwd packages/app
`

function main(argv: string[]): number {
  const patterns: string[] = []
  let cwd = process.cwd()

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
    } else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`)
      return 1
    } else {
      patterns.push(arg)
    }
  }

  if (patterns.length === 0) patterns.push('**/*.md')

  try {
    const entries = typegen(patterns, { cwd })
    for (const entry of entries) {
      console.log(`  ${relative(cwd, entry.declarationFile)}`)
    }
    if (entries.length === 0) {
      console.warn(`No markdown files matched: ${patterns.join(', ')}`)
    } else {
      console.log(`Generated ${entries.length} declaration file(s)`)
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

process.exit(main(process.argv.slice(2)))
