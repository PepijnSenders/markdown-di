import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MarkdownDI } from '../src/index'

const TEST_DIR = './test-tmp-sync'

describe('processSync', () => {
  const mdi = new MarkdownDI()
  const docFile = join(TEST_DIR, 'doc.md')

  const content = `---
name: sync-doc
description: A document
greeting: hello
buildTime: $dynamic
partials:
  intro: intro.md
---

{{partials.intro}}

{{greeting}}, built at {{buildTime}}.
`

  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    writeFileSync(join(TEST_DIR, 'intro.md'), '# Introduction\n')
    writeFileSync(docFile, content)
  })

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  test('produces identical output to process() for the same input', async () => {
    const hook = () => ({ buildTime: '2026-07-04' })
    const syncResult = mdi.processSync({
      content,
      baseDir: TEST_DIR,
      currentFile: docFile,
      onBeforeCompile: hook,
    })
    const asyncResult = await mdi.process({
      content,
      baseDir: TEST_DIR,
      currentFile: docFile,
      onBeforeCompile: hook,
    })

    expect(syncResult.errors).toEqual([])
    expect(syncResult.content).toBe(asyncResult.content)
    expect(syncResult.frontmatter).toEqual(asyncResult.frontmatter)
    expect(syncResult.dependencies).toEqual(asyncResult.dependencies)
  })

  test('renders partials and variables synchronously', () => {
    const result = mdi.processSync({
      content,
      baseDir: TEST_DIR,
      currentFile: docFile,
      onBeforeCompile: () => ({ buildTime: 'now' }),
    })

    expect(result.errors).toEqual([])
    expect(result.content).toContain('# Introduction')
    expect(result.content).toContain('hello, built at now.')
  })

  test('reports an error when onBeforeCompile returns a Promise', () => {
    const result = mdi.processSync({
      content,
      baseDir: TEST_DIR,
      currentFile: docFile,
      // biome-ignore lint/suspicious/noExplicitAny: deliberately passing an async hook
      onBeforeCompile: (async () => ({ buildTime: 'now' })) as any,
    })

    expect(result.errors.some((e) => e.message.includes('use process() for async hooks'))).toBe(
      true,
    )
  })

  test('supports strict mode', () => {
    const typoDoc = `---
name: sync-doc
description: Typo
greeting: hello
---

{{greting}}
`
    const result = mdi.processSync({ content: typoDoc, baseDir: TEST_DIR, strict: true })

    expect(
      result.errors.some((e) => e.type === 'injection' && e.message.includes('{{greting}}')),
    ).toBe(true)
  })

  test('enforces $dynamic fields', () => {
    const result = mdi.processSync({ content, baseDir: TEST_DIR, currentFile: docFile })

    expect(result.errors.some((e) => e.type === 'schema' && e.message.includes('buildTime'))).toBe(
      true,
    )
    expect(result.content).not.toContain('$dynamic')
  })
})
