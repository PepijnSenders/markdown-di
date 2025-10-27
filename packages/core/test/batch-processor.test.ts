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

  test('generates multiple variants from single template', async () => {
    mkdirSync(join(TEST_DIR, 'templates'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'templates', 'product.md'),
      `---
id: product-template
name: Product Template
---

# {{product}}

Price: {{price}}
SKU: {{sku}}
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'templates'),
      outDir: OUT_DIR,
      variants: {
        'product-template': {
          data: [
            { product: 'Widget A', price: '$10', sku: 'WA-001' },
            { product: 'Widget B', price: '$20', sku: 'WB-001' },
            { product: 'Widget C', price: '$30', sku: 'WC-001' }
          ],
          getOutputPath: (_context, data, _index) => {
            const slug = (data.product as string).toLowerCase().replace(/\s+/g, '-')
            return `products/${slug}.md`
          }
        }
      }
    })

    const result = await processor.process()

    expect(result.success).toBe(true)
    expect(result.changedFiles).toBe(3)
    expect(result.totalErrors).toBe(0)

    // Verify variant files were created
    const widgetA = await Bun.file(join(OUT_DIR, 'products', 'widget-a.md')).text()
    expect(widgetA).toContain('# Widget A')
    expect(widgetA).toContain('Price: $10')
    expect(widgetA).toContain('SKU: WA-001')

    const widgetB = await Bun.file(join(OUT_DIR, 'products', 'widget-b.md')).text()
    expect(widgetB).toContain('# Widget B')
    expect(widgetB).toContain('Price: $20')

    const widgetC = await Bun.file(join(OUT_DIR, 'products', 'widget-c.md')).text()
    expect(widgetC).toContain('# Widget C')
    expect(widgetC).toContain('Price: $30')
  })

  test('variant getOutputPath receives correct context and index', async () => {
    mkdirSync(join(TEST_DIR, 'templates'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'templates', 'item.md'),
      `---
id: item-template
name: Item
---
# {{title}}
`
    )

    const capturedContexts: any[] = []

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'templates'),
      outDir: OUT_DIR,
      variants: {
        'item-template': {
          data: [
            { title: 'First' },
            { title: 'Second' }
          ],
          getOutputPath: (context, data, index) => {
            capturedContexts.push({ context, data, index })
            return `item-${index}.md`
          }
        }
      }
    })

    await processor.process()

    expect(capturedContexts).toHaveLength(2)

    // First variant
    expect(capturedContexts[0].index).toBe(0)
    expect(capturedContexts[0].data.title).toBe('First')
    expect(capturedContexts[0].context.id).toBe('item-template')

    // Second variant
    expect(capturedContexts[1].index).toBe(1)
    expect(capturedContexts[1].data.title).toBe('Second')
    expect(capturedContexts[1].context.id).toBe('item-template')
  })

  test('mixes regular files and variant files in same batch', async () => {
    mkdirSync(join(TEST_DIR, 'mixed'), { recursive: true })

    // Regular file
    writeFileSync(
      join(TEST_DIR, 'mixed', 'regular.md'),
      `---
name: Regular File
greeting: Hello
---
# {{greeting}} {{name}}
`
    )

    // Template with variants
    writeFileSync(
      join(TEST_DIR, 'mixed', 'template.md'),
      `---
id: my-template
name: Template
---
# {{title}}
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'mixed'),
      outDir: OUT_DIR,
      variants: {
        'my-template': {
          data: [
            { title: 'Variant 1' },
            { title: 'Variant 2' }
          ],
          getOutputPath: (_context, _data, index) => `variant-${index}.md`
        }
      }
    })

    const result = await processor.process()

    expect(result.success).toBe(true)
    expect(result.changedFiles).toBe(3) // 1 regular + 2 variants
    expect(result.files).toHaveLength(3)

    // Verify regular file
    const regularContent = await Bun.file(join(OUT_DIR, 'regular.md')).text()
    expect(regularContent).toContain('# Hello Regular File')

    // Verify variants
    const variant1 = await Bun.file(join(OUT_DIR, 'variant-0.md')).text()
    expect(variant1).toContain('# Variant 1')

    const variant2 = await Bun.file(join(OUT_DIR, 'variant-1.md')).text()
    expect(variant2).toContain('# Variant 2')
  })

  test('does not write original template file when variants exist', async () => {
    mkdirSync(join(TEST_DIR, 'templates'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'templates', 'source.md'),
      `---
id: source-template
name: Source
---
# {{value}}
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'templates'),
      outDir: OUT_DIR,
      variants: {
        'source-template': {
          data: [{ value: 'Output 1' }],
          getOutputPath: () => 'output.md'
        }
      }
    })

    await processor.process()

    // Original template should not exist in output
    const sourceExists = existsSync(join(OUT_DIR, 'source.md'))
    expect(sourceExists).toBe(false)

    // Only variant should exist
    const outputExists = existsSync(join(OUT_DIR, 'output.md'))
    expect(outputExists).toBe(true)
  })

  test('handles variant processing errors gracefully', async () => {
    mkdirSync(join(TEST_DIR, 'templates'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'templates', 'bad.md'),
      `---
id: bad-template
schema: strict-schema
name: Bad Template
---
# {{title}}
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'templates'),
      outDir: OUT_DIR,
      schemas: {
        'strict-schema': z.object({
          requiredField: z.string()
        })
      },
      variants: {
        'bad-template': {
          data: [{ title: 'Test' }],
          getOutputPath: () => 'output.md'
        }
      }
    })

    const result = await processor.process()

    expect(result.success).toBe(false)
    expect(result.totalErrors).toBeGreaterThan(0)
  })

  test('variants work with onBeforeCompile hook', async () => {
    mkdirSync(join(TEST_DIR, 'templates'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'templates', 'combined.md'),
      `---
id: combined-template
name: Combined
buildTime: $dynamic
---
# {{title}}
Built at: {{buildTime}}
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'templates'),
      outDir: OUT_DIR,
      onBeforeCompile: async () => ({
        buildTime: '2024-01-15T10:00:00Z'
      }),
      variants: {
        'combined-template': {
          data: [
            { title: 'Page A' },
            { title: 'Page B' }
          ],
          getOutputPath: (_ctx, data, _idx) => {
            const slug = (data.title as string).toLowerCase().replace(/\s+/g, '-')
            return `${slug}.md`
          }
        }
      }
    })

    const result = await processor.process()

    expect(result.success).toBe(true)

    const pageA = await Bun.file(join(OUT_DIR, 'page-a.md')).text()
    expect(pageA).toContain('# Page A')
    expect(pageA).toContain('Built at: 2024-01-15T10:00:00Z')

    const pageB = await Bun.file(join(OUT_DIR, 'page-b.md')).text()
    expect(pageB).toContain('# Page B')
    expect(pageB).toContain('Built at: 2024-01-15T10:00:00Z')
  })

  test('variants in check mode do not write files', async () => {
    mkdirSync(join(TEST_DIR, 'templates'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'templates', 'check.md'),
      `---
id: check-template
name: Check
---
# {{value}}
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'templates'),
      outDir: OUT_DIR,
      check: true,
      variants: {
        'check-template': {
          data: [
            { value: 'Test 1' },
            { value: 'Test 2' }
          ],
          getOutputPath: (_ctx, _data, idx) => `test-${idx}.md`
        }
      }
    })

    const result = await processor.process()

    expect(result.changedFiles).toBe(2)

    // No files should be written in check mode
    expect(existsSync(OUT_DIR)).toBe(false)
  })

  test('variants work with $dynamic fields', async () => {
    mkdirSync(join(TEST_DIR, 'templates'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'templates', 'dynamic.md'),
      `---
id: dynamic-template
name: $dynamic
command: $dynamic
description: $dynamic
---
# {{name}}

Command: {{command}}

{{description}}
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'templates'),
      outDir: OUT_DIR,
      variants: {
        'dynamic-template': {
          data: [
            {
              name: 'Recipe Command',
              command: '/recipe',
              description: 'Generate cooking recipes'
            },
            {
              name: 'Code Command',
              command: '/code',
              description: 'Generate code snippets'
            }
          ],
          getOutputPath: (_ctx, data, _idx) => {
            const slug = (data.name as string).toLowerCase().replace(/\s+/g, '-')
            return `${slug}.md`
          }
        }
      }
    })

    const result = await processor.process()

    expect(result.success).toBe(true)
    expect(result.changedFiles).toBe(2)
    expect(result.totalErrors).toBe(0)

    // Verify first variant
    const recipe = await Bun.file(join(OUT_DIR, 'recipe-command.md')).text()
    expect(recipe).toContain('# Recipe Command')
    expect(recipe).toContain('Command: /recipe')
    expect(recipe).toContain('Generate cooking recipes')

    // Verify second variant
    const code = await Bun.file(join(OUT_DIR, 'code-command.md')).text()
    expect(code).toContain('# Code Command')
    expect(code).toContain('Command: /code')
    expect(code).toContain('Generate code snippets')
  })

  test('variants with $dynamic fields fails when data not provided', async () => {
    mkdirSync(join(TEST_DIR, 'templates'), { recursive: true })

    writeFileSync(
      join(TEST_DIR, 'templates', 'incomplete.md'),
      `---
id: incomplete-template
name: $dynamic
description: $dynamic
---
# {{name}}
`
    )

    const processor = new BatchProcessor({
      baseDir: join(TEST_DIR, 'templates'),
      outDir: OUT_DIR,
      variants: {
        'incomplete-template': {
          data: [
            { name: 'Test' } // Missing 'description'
          ],
          getOutputPath: () => 'output.md'
        }
      }
    })

    const result = await processor.process()

    expect(result.success).toBe(false)
    expect(result.totalErrors).toBeGreaterThan(0)
    expect(result.files[0].errors[0].message).toContain('$dynamic')
    expect(result.files[0].errors[0].message).toContain('description')
  })
})
