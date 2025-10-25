import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MarkdownDI } from '@markdown-di/core'

const TEST_DIR = join(__dirname, '../../test-fixtures-cli')
const INPUT_DIR = join(TEST_DIR, 'src')
const OUTPUT_DIR = join(TEST_DIR, 'dist')

// Setup test fixtures
function setupTestFixtures() {
  // Create test directories
  mkdirSync(INPUT_DIR, { recursive: true })
  mkdirSync(join(INPUT_DIR, 'sections'), { recursive: true })
  mkdirSync(join(INPUT_DIR, 'guides'), { recursive: true })
  mkdirSync(join(INPUT_DIR, 'docs'), { recursive: true })

  // Create reusable section files
  writeFileSync(
    join(INPUT_DIR, 'sections', 'intro.md'),
    `---
name: intro-section
description: Introduction section
---

# Introduction

Welcome to this documentation. This is a reusable introduction section.
`,
  )

  writeFileSync(
    join(INPUT_DIR, 'sections', 'conclusion.md'),
    `---
name: conclusion-section
description: Conclusion section
---

# Conclusion

Thank you for reading. This concludes the documentation.
`,
  )

  // Create guide files
  writeFileSync(
    join(INPUT_DIR, 'guides', 'getting-started.md'),
    `---
name: getting-started-guide
description: Getting started guide
---

## Getting Started

1. Install the package
2. Configure your settings
3. Start using it
`,
  )

  writeFileSync(
    join(INPUT_DIR, 'guides', 'advanced.md'),
    `---
name: advanced-guide
description: Advanced usage guide
---

## Advanced Usage

Here are some advanced patterns and techniques.
`,
  )

  // Create main document that uses dependencies
  writeFileSync(
    join(INPUT_DIR, 'docs', 'main.md'),
    `---
name: main-documentation
description: Main documentation file

partials:
  intro: sections/intro.md
  conclusion: sections/conclusion.md
  guides:
    - guides/*.md
---

# Complete Documentation

{{partials.intro}}

## Core Content

This is the main content of the documentation.

## Related Guides

{{partials.guides}}

{{partials.conclusion}}
`,
  )

  // Create document with validation errors
  writeFileSync(
    join(INPUT_DIR, 'docs', 'invalid.md'),
    `---
name: invalid-document
description: Document with errors

partials:
  missing: sections/does-not-exist.md
---

# Invalid Document

{{partials.missing}}
{{undefined.reference}}
`,
  )

  // Create simple document
  writeFileSync(
    join(INPUT_DIR, 'simple.md'),
    `---
name: simple-document
description: A simple document

partials:
  intro: sections/intro.md
---

# Simple Document

{{partials.intro}}

## More Content

Additional content here.
`,
  )
}

// Cleanup test fixtures
function cleanupTestFixtures() {
  rmSync(TEST_DIR, { recursive: true, force: true })
}

// Helper to simulate CLI build operation
async function buildFile(inputPath: string, outputPath: string, baseDir: string) {
  const mdi = new MarkdownDI()
  const content = readFileSync(inputPath, 'utf-8')

  const result = await mdi.process({
    content,
    baseDir,
    currentFile: inputPath,
    mode: 'build',
  })

  // Create output directory if needed
  const outputDir = join(outputPath, '..')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  writeFileSync(outputPath, result.content)

  return result
}

// Helper to simulate CLI validate operation
async function validateFile(inputPath: string, baseDir: string) {
  const mdi = new MarkdownDI()
  const content = readFileSync(inputPath, 'utf-8')

  const result = await mdi.process({
    content,
    baseDir,
    currentFile: inputPath,
    mode: 'validate',
  })

  return result
}

describe('markdown-di CLI - Integration Tests', () => {
  beforeAll(() => {
    setupTestFixtures()
  })

  afterAll(() => {
    cleanupTestFixtures()
  })

  describe('Build Operations', () => {
    test('builds single file successfully', async () => {
      // Clean output directory
      if (existsSync(OUTPUT_DIR)) {
        rmSync(OUTPUT_DIR, { recursive: true })
      }
      mkdirSync(OUTPUT_DIR, { recursive: true })

      const inputFile = join(INPUT_DIR, 'simple.md')
      const outputFile = join(OUTPUT_DIR, 'simple.md')

      const result = await buildFile(inputFile, outputFile, INPUT_DIR)

      expect(result.content).toMatchSnapshot()
      expect(result.errors).toMatchSnapshot()
      expect(result.frontmatter).toMatchSnapshot()

      // Check output file exists
      expect(existsSync(outputFile)).toBe(true)

      // Check output content
      const output = readFileSync(outputFile, 'utf-8')
      expect(output).toMatchSnapshot()
    })

    test('builds complex document with multiple dependencies', async () => {
      if (existsSync(OUTPUT_DIR)) {
        rmSync(OUTPUT_DIR, { recursive: true })
      }
      mkdirSync(join(OUTPUT_DIR, 'docs'), { recursive: true })

      const inputFile = join(INPUT_DIR, 'docs', 'main.md')
      const outputFile = join(OUTPUT_DIR, 'docs', 'main.md')

      const result = await buildFile(inputFile, outputFile, INPUT_DIR)

      expect(result.content).toMatchSnapshot()
      expect(result.errors).toMatchSnapshot()
      expect(result.dependencies).toMatchSnapshot()

      // Check output file exists
      expect(existsSync(outputFile)).toBe(true)

      const output = readFileSync(outputFile, 'utf-8')
      expect(output).toMatchSnapshot()
    })

    test('reports build errors for invalid files', async () => {
      if (existsSync(OUTPUT_DIR)) {
        rmSync(OUTPUT_DIR, { recursive: true })
      }
      mkdirSync(join(OUTPUT_DIR, 'docs'), { recursive: true })

      const inputFile = join(INPUT_DIR, 'docs', 'invalid.md')
      const outputFile = join(OUTPUT_DIR, 'docs', 'invalid.md')

      const result = await buildFile(inputFile, outputFile, INPUT_DIR)

      expect(result.errors).toMatchSnapshot()
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some((e) => e.type === 'file' || e.type === 'partial')).toBe(true)
    })

    test('handles files with no dependencies', async () => {
      if (existsSync(OUTPUT_DIR)) {
        rmSync(OUTPUT_DIR, { recursive: true })
      }
      mkdirSync(OUTPUT_DIR, { recursive: true })

      const standaloneContent = `---
name: standalone-document
description: Document without dependencies
---

# Standalone Document

This document has no dependencies.

## Content

Just regular markdown content.
`

      const inputFile = join(INPUT_DIR, 'standalone.md')
      const outputFile = join(OUTPUT_DIR, 'standalone.md')

      writeFileSync(inputFile, standaloneContent)

      const result = await buildFile(inputFile, outputFile, INPUT_DIR)

      expect(result.content).toMatchSnapshot()
      expect(result.errors).toMatchSnapshot()
      expect(result.dependencies).toMatchSnapshot()

      const output = readFileSync(outputFile, 'utf-8')
      expect(output).toMatchSnapshot()
    })
  })

  describe('Validation Operations', () => {
    test('validates single file successfully', async () => {
      const inputFile = join(INPUT_DIR, 'simple.md')
      const result = await validateFile(inputFile, INPUT_DIR)

      expect(result.errors).toMatchSnapshot()
      expect(result.frontmatter).toMatchSnapshot()
    })

    test('validates and reports errors', async () => {
      const inputFile = join(INPUT_DIR, 'docs', 'invalid.md')
      const result = await validateFile(inputFile, INPUT_DIR)

      expect(result.errors).toMatchSnapshot()
      expect(result.errors.length).toBeGreaterThan(0)
    })

    test('validates document structure', async () => {
      const badContent = `---
name: incomplete-doc
---

# Document Without Description

{{partials.intro}}
`

      const inputFile = join(INPUT_DIR, 'bad-structure.md')
      writeFileSync(inputFile, badContent)

      const result = await validateFile(inputFile, INPUT_DIR)

      expect(result.errors).toMatchSnapshot()
      // Mustache handles undefined variables gracefully - no errors expected
      expect(result.errors.length).toBe(0)
    })

    test('validates undefined references', async () => {
      const badRefs = `---
name: bad-refs
description: Document with undefined references

partials:
  intro: sections/intro.md
---

# Document

{{partials.intro}}
{{partials.undefined}}
{{something.random}}
`

      const inputFile = join(INPUT_DIR, 'bad-refs.md')
      writeFileSync(inputFile, badRefs)

      const result = await validateFile(inputFile, INPUT_DIR)

      expect(result.errors).toMatchSnapshot()
      // Mustache handles undefined variables gracefully - no errors expected
      expect(result.errors.length).toBe(0)
    })
  })

  describe('Complex Scenarios', () => {
    test('processes document with nested blueprints and references', async () => {
      if (existsSync(OUTPUT_DIR)) {
        rmSync(OUTPUT_DIR, { recursive: true })
      }
      mkdirSync(join(OUTPUT_DIR, 'complex'), { recursive: true })

      const complexContent = `---
name: complex-index
description: Complex project index

partials:
  intro: sections/intro.md
  conclusion: sections/conclusion.md
  guides:
    - guides/*.md
---

# Project Index

{{partials.intro}}

## Guides

{{partials.guides}}

{{partials.conclusion}}
`

      const inputFile = join(INPUT_DIR, 'complex', 'index.md')
      mkdirSync(join(INPUT_DIR, 'complex'), { recursive: true })
      writeFileSync(inputFile, complexContent)

      const outputFile = join(OUTPUT_DIR, 'complex', 'index.md')

      const result = await buildFile(inputFile, outputFile, INPUT_DIR)

      expect(result.content).toMatchSnapshot()
      expect(result.errors).toMatchSnapshot()
      expect(result.dependencies).toMatchSnapshot()

      const output = readFileSync(outputFile, 'utf-8')
      expect(output).toMatchSnapshot()
    })

    test('handles documents with mixed content types', async () => {
      const mixedContent = `---
name: mixed-content
description: Document with various markdown elements

partials:
  intro: sections/intro.md
---

# Mixed Content Document

{{partials.intro}}

## Code Example

\`\`\`javascript
const example = "Hello World";
console.log(example);
\`\`\`

## Table

| Column 1 | Column 2 |
|----------|----------|
| Value 1  | Value 2  |

## List

- Item 1
- Item 2
  - Nested item
- Item 3

> **Note:** This is a blockquote.
`

      const inputFile = join(INPUT_DIR, 'mixed.md')
      writeFileSync(inputFile, mixedContent)

      const outputFile = join(OUTPUT_DIR, 'mixed.md')
      mkdirSync(OUTPUT_DIR, { recursive: true })

      const result = await buildFile(inputFile, outputFile, INPUT_DIR)

      expect(result.content).toMatchSnapshot()
      expect(result.errors).toMatchSnapshot()
    })

    test('preserves markdown formatting and structure', async () => {
      const formattedContent = `---
name: formatted-doc
description: Document with specific formatting

partials:
  conclusion: sections/conclusion.md
---

# Title with **Bold** and *Italic*

This is a paragraph with [a link](https://example.com).

## Subsection

Content here with \`inline code\`.

{{partials.conclusion}}

### Deeper Heading

Final content.
`

      const inputFile = join(INPUT_DIR, 'formatted.md')
      writeFileSync(inputFile, formattedContent)

      const outputFile = join(OUTPUT_DIR, 'formatted.md')
      mkdirSync(OUTPUT_DIR, { recursive: true })

      const result = await buildFile(inputFile, outputFile, INPUT_DIR)

      expect(result.content).toMatchSnapshot()

      const output = readFileSync(outputFile, 'utf-8')
      expect(output).toMatchSnapshot()
    })
  })

  describe('Edge Cases', () => {
    test('handles empty frontmatter gracefully', async () => {
      const emptyFrontmatter = `---
---

# Content

Some content without proper frontmatter.
`

      const inputFile = join(INPUT_DIR, 'empty-fm.md')
      writeFileSync(inputFile, emptyFrontmatter)

      const result = await validateFile(inputFile, INPUT_DIR)

      expect(result.errors).toMatchSnapshot()
      expect(result.errors.length).toBeGreaterThan(0)
    })

    test('handles missing files in dependencies', async () => {
      const missingDeps = `---
name: missing-deps
description: Document with missing dependencies

partials:
  nonexistent: sections/does-not-exist.md
---

# Document

{{partials.nonexistent}}
`

      const inputFile = join(INPUT_DIR, 'missing-deps.md')
      writeFileSync(inputFile, missingDeps)

      const result = await validateFile(inputFile, INPUT_DIR)

      expect(result.errors).toMatchSnapshot()
      expect(result.errors.some((e) => e.type === 'file')).toBe(true)
    })

    test('handles malformed reference syntax', async () => {
      const malformedRefs = `---
name: malformed-refs
description: Document with malformed references
---

# Document

{{}}
{{invalid{nested}}}
{{too.many.levels.here.really}}
`

      const inputFile = join(INPUT_DIR, 'malformed.md')
      writeFileSync(inputFile, malformedRefs)

      const result = await validateFile(inputFile, INPUT_DIR)

      expect(result.errors).toMatchSnapshot()
      expect(result.errors.some((e) => e.type === 'syntax')).toBe(true)
    })

    test('handles documents with special characters', async () => {
      const specialChars = `---
name: special-chars
description: Document with special characters

partials:
  intro: sections/intro.md
---

# Special Characters Test

This document contains special characters: é, ñ, ü, 中文, 日本語

{{partials.intro}}
`

      const inputFile = join(INPUT_DIR, 'special-chars.md')
      writeFileSync(inputFile, specialChars)

      const outputFile = join(OUTPUT_DIR, 'special-chars.md')
      mkdirSync(OUTPUT_DIR, { recursive: true })

      const result = await buildFile(inputFile, outputFile, INPUT_DIR)

      expect(result.content).toMatchSnapshot()
      expect(result.errors).toMatchSnapshot()
    })
  })
})
