#!/usr/bin/env node

import { Command } from 'commander'
import { buildCommand } from './commands/build'
import { validateCommand } from './commands/validate'

const program = new Command()

program
  .name('markdown-di')
  .description('CLI tool for markdown dependency injection and validation')
  .version('0.1.0')

program
  .command('build')
  .description('Build markdown files with dependency injection')
  .argument('<input>', 'Input file or directory')
  .option('-o, --output <dir>', 'Output directory')
  .option('-c, --config <path>', 'Path to config file')
  .option('-w, --watch', 'Watch for changes (not yet implemented)', false)
  .action(buildCommand)

program
  .command('validate')
  .description('Validate markdown files without building')
  .argument('<input>', 'Input file or directory')
  .option('-c, --config <path>', 'Path to config file')
  .action(validateCommand)

program.parse()
