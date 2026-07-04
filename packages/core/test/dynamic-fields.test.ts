import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MarkdownDI } from '../src/index'

const TEST_DIR = './test-tmp-dynamic'

describe('$dynamic fields', () => {
  const mdi = new MarkdownDI()
  const docFile = join(TEST_DIR, 'doc.md')

  const content = `---
name: dynamic-doc
description: Uses a dynamic field
apiKey: $dynamic
---

Key is {{apiKey}}
`

  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    writeFileSync(docFile, content)
  })

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  test('errors when no onBeforeCompile hook is configured', async () => {
    const result = await mdi.process({ content, baseDir: TEST_DIR })

    expect(
      result.errors.some(
        (e) => e.type === 'schema' && e.message.includes('$dynamic fields were not provided'),
      ),
    ).toBe(true)
    expect(result.errors.some((e) => e.message.includes('apiKey'))).toBe(true)
  })

  test('never renders the literal string $dynamic into output', async () => {
    const result = await mdi.process({ content, baseDir: TEST_DIR })

    expect(result.content).not.toContain('$dynamic')
  })

  test('errors when hook is configured but does not provide the field', async () => {
    const result = await mdi.process({
      content,
      baseDir: TEST_DIR,
      currentFile: docFile,
      onBeforeCompile: () => ({}),
    })

    expect(result.errors.some((e) => e.type === 'schema' && e.message.includes('apiKey'))).toBe(
      true,
    )
    expect(result.content).not.toContain('$dynamic')
  })

  test('errors when currentFile is missing so the hook cannot run', async () => {
    const result = await mdi.process({
      content,
      baseDir: TEST_DIR,
      onBeforeCompile: () => ({ apiKey: 'never-used' }),
    })

    expect(result.errors.some((e) => e.type === 'schema' && e.message.includes('apiKey'))).toBe(
      true,
    )
  })

  test('errors when the hook echoes the literal $dynamic marker back', async () => {
    const result = await mdi.process({
      content,
      baseDir: TEST_DIR,
      currentFile: docFile,
      onBeforeCompile: (context) => ({ ...context.frontmatter }),
    })

    expect(result.errors.some((e) => e.type === 'schema' && e.message.includes('apiKey'))).toBe(
      true,
    )
    expect(result.content).not.toContain('$dynamic')
  })

  test('succeeds and renders when the hook provides the value', async () => {
    const result = await mdi.process({
      content,
      baseDir: TEST_DIR,
      currentFile: docFile,
      onBeforeCompile: () => ({ apiKey: 'sk-123' }),
    })

    expect(result.errors).toEqual([])
    expect(result.content).toContain('Key is sk-123')
  })

  test('hook still receives the $dynamic markers and field list', async () => {
    let seenDynamicFields: string[] = []
    let seenMarker: unknown
    await mdi.process({
      content,
      baseDir: TEST_DIR,
      currentFile: docFile,
      onBeforeCompile: (context) => {
        seenDynamicFields = context.dynamicFields
        seenMarker = context.frontmatter.apiKey
        return { apiKey: 'sk-123' }
      },
    })

    expect(seenDynamicFields).toEqual(['apiKey'])
    expect(seenMarker).toBe('$dynamic')
  })
})
