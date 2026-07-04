import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BatchProcessor } from '../src/index'

const TEST_DIR = './test-tmp-batch'
const OUT_DIR = './test-tmp-batch-out'

describe('BatchProcessor', () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    rmSync(OUT_DIR, { recursive: true, force: true })
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    rmSync(OUT_DIR, { recursive: true, force: true })
  })

  test('processes files and writes to outDir', async () => {
    writeFileSync(join(TEST_DIR, 'intro.md'), '# Introduction\n\nWelcome.\n')
    writeFileSync(
      join(TEST_DIR, 'doc.md'),
      `---
name: doc
description: A document
partials:
  intro: intro.md
---

{{partials.intro}}
`,
    )

    const processor = new BatchProcessor({
      baseDir: TEST_DIR,
      outDir: OUT_DIR,
      silent: true,
      // intro.md is a frontmatter-less partial, not a document of its own
      include: ['doc.md'],
    })
    const result = await processor.process()

    expect(result.success).toBe(true)
    expect(result.totalFiles).toBe(1)
    expect(readFileSync(join(OUT_DIR, 'doc.md'), 'utf-8')).toContain('# Introduction')
  })

  test('non-variant files get the full $dynamic check', async () => {
    writeFileSync(
      join(TEST_DIR, 'doc.md'),
      `---
name: doc
description: Needs a dynamic value
apiKey: $dynamic
---

Key {{apiKey}}
`,
    )

    const processor = new BatchProcessor({
      baseDir: TEST_DIR,
      outDir: OUT_DIR,
      silent: true,
    })
    const result = await processor.process()

    expect(result.success).toBe(false)
    expect(
      result.allErrors.some(
        (e) => e.type === 'schema' && e.message.includes('$dynamic fields were not provided'),
      ),
    ).toBe(true)
    // Nothing should be written for an erroring file
    expect(existsSync(join(OUT_DIR, 'doc.md'))).toBe(false)
  })

  test('non-variant $dynamic satisfied by onBeforeCompile succeeds', async () => {
    writeFileSync(
      join(TEST_DIR, 'doc.md'),
      `---
name: doc
description: Needs a dynamic value
buildTime: $dynamic
---

Built at {{buildTime}}
`,
    )

    const processor = new BatchProcessor({
      baseDir: TEST_DIR,
      outDir: OUT_DIR,
      silent: true,
      onBeforeCompile: () => ({ buildTime: '2026-07-04' }),
    })
    const result = await processor.process()

    expect(result.success).toBe(true)
    expect(readFileSync(join(OUT_DIR, 'doc.md'), 'utf-8')).toContain('Built at 2026-07-04')
  })

  test('passes strict mode through to file processing', async () => {
    writeFileSync(
      join(TEST_DIR, 'doc.md'),
      `---
name: doc
description: Has a typo'd variable
greeting: hello
---

{{greting}} world
`,
    )

    const processor = new BatchProcessor({
      baseDir: TEST_DIR,
      outDir: OUT_DIR,
      silent: true,
      strict: true,
    })
    const result = await processor.process()

    expect(result.success).toBe(false)
    expect(
      result.allErrors.some((e) => e.type === 'injection' && e.message.includes('{{greting}}')),
    ).toBe(true)
  })

  describe('variants', () => {
    const template = `---
id: product-template
name: product-page
description: Product page template
product: $dynamic
price: $dynamic
---

# {{product}}

Price: {{price}}
`

    test('generates one output file per variant with the variant data', async () => {
      writeFileSync(join(TEST_DIR, 'template.md'), template)

      const processor = new BatchProcessor({
        baseDir: TEST_DIR,
        outDir: OUT_DIR,
        silent: true,
        variants: {
          'product-template': {
            data: [
              { product: 'Widget A', price: '$10' },
              { product: 'Widget B', price: '$20' },
            ],
            getOutputPath: (_context, data) =>
              `products/${String(data.product).toLowerCase().replace(/\s+/g, '-')}.md`,
          },
        },
      })
      const result = await processor.process()

      expect(result.success).toBe(true)
      expect(readFileSync(join(OUT_DIR, 'products/widget-a.md'), 'utf-8')).toContain('# Widget A')
      expect(readFileSync(join(OUT_DIR, 'products/widget-b.md'), 'utf-8')).toContain('Price: $20')
    })

    test('variant missing a $dynamic field errors', async () => {
      writeFileSync(join(TEST_DIR, 'template.md'), template)

      const processor = new BatchProcessor({
        baseDir: TEST_DIR,
        outDir: OUT_DIR,
        silent: true,
        variants: {
          'product-template': {
            data: [{ product: 'Widget A' }], // price missing
            getOutputPath: (_context, _data, index) => `products/${index}.md`,
          },
        },
      })
      const result = await processor.process()

      expect(result.success).toBe(false)
      expect(result.allErrors.some((e) => e.type === 'schema' && e.message.includes('price'))).toBe(
        true,
      )
      expect(existsSync(join(OUT_DIR, 'products/0.md'))).toBe(false)
    })

    test('two variants mapping to the same output path error instead of silently overwriting', async () => {
      writeFileSync(join(TEST_DIR, 'template.md'), template)

      const processor = new BatchProcessor({
        baseDir: TEST_DIR,
        outDir: OUT_DIR,
        silent: true,
        variants: {
          'product-template': {
            data: [
              { product: 'Widget A', price: '$10' },
              { product: 'Widget B', price: '$20' },
            ],
            getOutputPath: () => 'products/same.md',
          },
        },
      })
      const result = await processor.process()

      expect(result.success).toBe(false)
      expect(
        result.allErrors.some(
          (e) => e.type === 'file' && e.message.includes('Output path collision'),
        ),
      ).toBe(true)
      // The first variant's output must not be clobbered by the second
      expect(readFileSync(join(OUT_DIR, 'products/same.md'), 'utf-8')).toContain('# Widget A')
    })

    test('a variant colliding with a regular file output errors', async () => {
      writeFileSync(
        join(TEST_DIR, 'plain.md'),
        `---
name: plain
description: A plain document
---

Plain content.
`,
      )
      writeFileSync(join(TEST_DIR, 'template.md'), template)

      const processor = new BatchProcessor({
        baseDir: TEST_DIR,
        outDir: OUT_DIR,
        silent: true,
        variants: {
          'product-template': {
            data: [{ product: 'Widget A', price: '$10' }],
            getOutputPath: () => 'plain.md',
          },
        },
      })
      const result = await processor.process()

      expect(result.success).toBe(false)
      expect(
        result.allErrors.some(
          (e) => e.type === 'file' && e.message.includes('Output path collision'),
        ),
      ).toBe(true)
    })

    test('check mode reports variants without writing files', async () => {
      writeFileSync(join(TEST_DIR, 'template.md'), template)

      const processor = new BatchProcessor({
        baseDir: TEST_DIR,
        outDir: OUT_DIR,
        silent: true,
        check: true,
        variants: {
          'product-template': {
            data: [{ product: 'Widget A', price: '$10' }],
            getOutputPath: (_context, _data, index) => `products/${index}.md`,
          },
        },
      })
      const result = await processor.process()

      expect(result.success).toBe(true)
      expect(result.files.map((f) => f.file)).toContain('products/0.md')
      expect(existsSync(OUT_DIR)).toBe(false)
    })
  })
})
