import { describe, expect, test } from 'bun:test'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseFrontmatter } from '@markdown-di/core/modules'
import { readFrontmatter } from '../src/frontmatter'
import { markdownDiBundleLoader } from '../src/loader'
import '../src/plugin'

const FIXTURES = join(import.meta.dir, 'fixtures')

const markdownFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return markdownFiles(path)
    return /\.(md|markdown)$/.test(name) ? [path] : []
  })

describe('lazy templates', () => {
  test('a template with a broken partial imports, and throws only when rendered', async () => {
    const mod = await import('./fixtures/lazy/missing-partial.md')
    expect(mod.frontmatter.partials).toEqual({ gone: 'nowhere.md' })
    expect(() => mod.default()).toThrow('nowhere.md')
  })

  test('a template renders the same on every call', async () => {
    const mod = await import('./fixtures/prompts/compile-brief.md')
    const args = { transcript: 't', productName: 'Jig' }
    expect(mod.default(args)).toBe(mod.default(args))
  })

  test('the bundled module defers the renderer and inlines frontmatter and source', async () => {
    const result = await Bun.build({
      entrypoints: [join(FIXTURES, 'prompts/compile-brief.md')],
      plugins: [markdownDiBundleLoader],
      target: 'bun',
      external: ['@markdown-di/bun/runtime'],
    })
    expect(result.success).toBe(true)
    const js = await result.outputs[0].text()
    expect(js).toContain('@markdown-di/bun/runtime')
    expect(js).not.toMatch(/from\s*"@markdown-di\/bun"/)
    expect(js).toContain('compile-brief')
    expect(js).toMatch(/\?\?=/)
  })

  test('the bundled module still fails the build on a broken partial', async () => {
    const result = await Bun.build({
      entrypoints: [join(FIXTURES, 'lazy/missing-partial.md')],
      plugins: [markdownDiBundleLoader],
      target: 'bun',
      external: ['@markdown-di/bun/runtime'],
      throw: false,
    })
    expect(result.success).toBe(false)
  })
})

describe('readFrontmatter', () => {
  for (const path of markdownFiles(FIXTURES)) {
    const name = relative(FIXTURES, path)
    test(`matches core's parser on ${name}`, async () => {
      const source = await Bun.file(path).text()
      let expected: ReturnType<typeof parseFrontmatter> | Error
      try {
        expected = parseFrontmatter(source, path)
      } catch (error) {
        expected = error as Error
      }
      if (expected instanceof Error) {
        expect(() => readFrontmatter(source, path)).toThrow()
        return
      }
      const fast = readFrontmatter(source, path)
      expect(fast.frontmatter).toEqual(expected.frontmatter)
      expect(fast.body).toBe(expected.body)
      expect(fast.hasFrontmatter).toBe(expected.hasFrontmatter)
      expect(fast.bodyLine).toBe(expected.bodyLine)
    })
  }

  test('falls back to core for an export declaration, keeping its line', () => {
    const source = '---\nexport: nope\n---\nbody'
    expect(readFrontmatter(source, 'x.md').keyLines.export).toBe(2)
  })

  test('falls back to core for a fenced language and for invalid YAML', () => {
    expect(() => readFrontmatter('---toml\na = 1\n---\n', 'x.md')).toThrow('only YAML')
    expect(() => readFrontmatter('---\n: [\n---\n', 'x.md')).toThrow()
  })
})
