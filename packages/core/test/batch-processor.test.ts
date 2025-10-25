import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { BatchProcessor, z } from '../src/index'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(__dirname, '__test-batch__')
const OUT_DIR = join(TEST_DIR, 'dist')

describe('BatchProcessor', () => {
  beforeEach(() => {
    // Clean up and create test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  test('processes multiple markdown files with schemas', async () => {
    // Create test files
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'docs', 'post1.md'),
      `---
schema: blog-post
name: First Post
author: John Doe
tags: [javascript, tutorial]
---

# {{name}}

By {{author}}
`
    )

    writeFileSync(
      join(TEST_DIR, 'docs', 'post2.md'),
      `---
schema: blog-post
name: Second Post
author: Jane Smith
tags: [typescript, advanced]
---

# {{name}}

By {{author}}
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'docs'),
      outDir: OUT_DIR,
      schemas: {
        'blog-post': z.object({
          author: z.string(),
          tags: z.array(z.string())
        })
      }
    })

    const result = await processor.process()

    expect(result.success).toBe(true)
    expect(result.totalFiles).toBe(2)
    expect(result.changedFiles).toBe(2)
    expect(result.totalErrors).toBe(0)
    expect(result.files.length).toBe(2)
  })

  test('validates schema errors', async () => {
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'docs', 'invalid.md'),
      `---
schema: blog-post
name: Invalid Post
author: John Doe
tags: "should-be-array"
---

# Content
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'docs'),
      schemas: {
        'blog-post': z.object({
          author: z.string(),
          tags: z.array(z.string())
        })
      }
    })

    const result = await processor.process()

    expect(result.success).toBe(false)
    expect(result.totalErrors).toBeGreaterThan(0)
    expect(result.files[0].errors.length).toBeGreaterThan(0)
    expect(result.files[0].errors[0].type).toBe('schema')
  })

  test('processes partials without HTML encoding', async () => {
    mkdirSync(join(TEST_DIR, 'shared'), { recursive: true })

    // Create a partial file in shared directory
    writeFileSync(
      join(TEST_DIR, 'shared', 'footer.md'),
      `Don't forget to check the \`code\` and it's awesome!`
    )

    writeFileSync(
      join(TEST_DIR, 'main.md'),
      `---
name: Main Doc
partials:
  footer: shared/footer.md
---

# Main Content

{{partials.footer}}
`
    )

    const processor = new BatchProcessor({
      baseDir: TEST_DIR,
      include: ['*.md'], // Only process top-level markdown files
      outDir: OUT_DIR
    })

    const result = await processor.process()

    expect(result.success).toBe(true)

    // Read the output file
    const outputContent = Bun.file(join(OUT_DIR, 'main.md'))
    const content = await outputContent.text()

    // Verify no HTML encoding (should have literal apostrophe and backticks)
    expect(content).toContain("Don't forget")
    expect(content).toContain("`code`")
    expect(content).toContain("it's awesome")

    // Verify NO HTML entities
    expect(content).not.toContain("&#39;")
    expect(content).not.toContain("&#x60;")
    expect(content).not.toContain("&quot;")
  })

  test('writes to output directory without overwriting sources', async () => {
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true })

    const sourceContent = `---
name: Test Doc
greeting: Hello
---

# {{greeting}} {{name}}
`

    writeFileSync(join(TEST_DIR, 'docs', 'test.md'), sourceContent)

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'docs'),
      outDir: OUT_DIR
    })

    await processor.process()

    // Verify source file unchanged
    const originalContent = await Bun.file(join(TEST_DIR, 'docs', 'test.md')).text()
    expect(originalContent).toBe(sourceContent)

    // Verify output file exists and is processed
    const outputContent = await Bun.file(join(OUT_DIR, 'test.md')).text()
    expect(outputContent).toContain('# Hello Test Doc')
  })

  test('check mode does not write files', async () => {
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'docs', 'test.md'),
      `---
name: Test
value: example
---

# {{name}}: {{value}}
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'docs'),
      outDir: OUT_DIR,
      check: true
    })

    const result = await processor.process()

    expect(result.changedFiles).toBe(1)
    // Output directory should not be created in check mode
    expect(existsSync(OUT_DIR)).toBe(false)
  })

  test('processes with onBeforeCompile hook', async () => {
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'docs', 'dynamic.md'),
      `---
name: Dynamic Doc
buildTime: $dynamic
version: $dynamic
---

Built at {{buildTime}}
Version: {{version}}
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'docs'),
      outDir: OUT_DIR,
      onBeforeCompile: async () => ({
        buildTime: '2024-01-15T10:00:00Z',
        version: '1.0.0'
      })
    })

    const result = await processor.process()

    expect(result.success).toBe(true)

    const outputContent = await Bun.file(join(OUT_DIR, 'dynamic.md')).text()
    expect(outputContent).toContain('Built at 2024-01-15T10:00:00Z')
    expect(outputContent).toContain('Version: 1.0.0')
  })

  test('respects include and exclude patterns', async () => {
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true })
    mkdirSync(join(TEST_DIR, 'ignore'), { recursive: true })

    writeFileSync(join(TEST_DIR, 'docs', 'included.md'), '---\nname: Included\n---\n# {{name}}')
    writeFileSync(join(TEST_DIR, 'ignore', 'excluded.md'), '---\nname: Excluded\n---\n# {{name}}')

    const processor = new BatchProcessor({
      baseDir: TEST_DIR,
      include: ['docs/**/*.md'],
      exclude: ['ignore/**'],
      outDir: OUT_DIR
    })

    const result = await processor.process()

    expect(result.totalFiles).toBe(1)
    expect(result.files[0].file).toContain('included.md')
  })

  test('handles multiple schemas', async () => {
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'docs', 'blog.md'),
      `---
schema: blog-post
name: Blog Post
author: John
tags: [js]
---
# {{name}}
`
    )

    writeFileSync(
      join(TEST_DIR, 'docs', 'api.md'),
      `---
schema: api-doc
name: API Doc
endpoint: /api/users
method: GET
---
# {{endpoint}}
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'docs'),
      outDir: OUT_DIR,
      schemas: {
        'blog-post': z.object({
          author: z.string(),
          tags: z.array(z.string())
        }),
        'api-doc': z.object({
          endpoint: z.string(),
          method: z.enum(['GET', 'POST', 'PUT', 'DELETE'])
        })
      }
    })

    const result = await processor.process()

    expect(result.success).toBe(true)
    expect(result.totalFiles).toBe(2)
    expect(result.totalErrors).toBe(0)
  })
})
