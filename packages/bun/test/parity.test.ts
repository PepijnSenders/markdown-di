import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
// Import core from source (like core's own tests) so this suite does not
// depend on core's dist being built.
import { FrontmatterProcessor, MarkdownDI } from '../../core/src/index'
import { createRenderer } from '../src/render'

const fixture = (name: string) => join(import.meta.dir, 'fixtures', name)

/** Render the same file through core's processor and return the body, trimmed. */
async function renderWithCore(file: string, args: Record<string, unknown>): Promise<string> {
  const content = readFileSync(file, 'utf-8')
  const mdi = new MarkdownDI()
  const result = await mdi.process({
    content,
    baseDir: dirname(file),
    currentFile: file,
    onBeforeCompile: () => ({ ...args }),
  })
  expect(result.errors).toEqual([])
  return new FrontmatterProcessor().extract(result.content).body.trim()
}

describe('parity with @markdown-di/core', () => {
  test('partials, $parent scoping, and sections match core output', async () => {
    const file = fixture('prompts/compile-brief.md')
    const args = { transcript: 'Users want faster onboarding.', productName: 'Jig', attempt: 2 }
    const loaderOutput = createRenderer(file).render(args)
    expect(loaderOutput).toBe(await renderWithCore(file, args))
  })

  test('absent optional params match core output', async () => {
    const file = fixture('prompts/compile-brief.md')
    const args = { transcript: 'Users want faster onboarding.', productName: 'Jig' }
    const loaderOutput = createRenderer(file).render(args)
    expect(loaderOutput).toBe(await renderWithCore(file, args))
  })

  test('glob partials match core output', async () => {
    const file = fixture('strict/glob-partials.md')
    const args = { productName: 'Jig' }
    const loaderOutput = createRenderer(file).render(args)
    expect(loaderOutput).toBe(await renderWithCore(file, args))
  })
})
