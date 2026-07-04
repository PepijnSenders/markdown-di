import { describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { generateDeclaration, typegen } from '../src/typegen'

const fixture = (name: string) => join(import.meta.dir, 'fixtures', name)

describe('typegen', () => {
  test('declaration for a params-block prompt matches snapshot', () => {
    expect(generateDeclaration(fixture('prompts/compile-brief.md'))).toMatchSnapshot()
  })

  test('declaration for a $dynamic prompt matches snapshot', () => {
    expect(generateDeclaration(fixture('prompts/dynamic-style.md'))).toMatchSnapshot()
  })

  test('declaration for markdown without params has a zero-arg render', () => {
    const contents = generateDeclaration(fixture('static.md'))
    expect(contents).toContain('declare function render(): string')
    expect(contents).not.toContain('interface')
  })

  test('all-optional params make the params argument optional', () => {
    const contents = generateDeclaration(fixture('strict/optional-interpolated.md'))
    expect(contents).toContain(
      'declare function render(params?: OptionalInterpolatedParams): string',
    )
    expect(contents).toContain('topic?: string')
  })

  test('typegen walks a glob and writes sibling .d.md.ts files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-di-typegen-'))
    try {
      cpSync(fixture('prompts'), join(dir, 'prompts'), { recursive: true })
      const entries = typegen('prompts/**/*.md', { cwd: dir })

      expect(entries.map((entry) => relative(dir, entry.declarationFile))).toEqual([
        'prompts/compile-brief.d.md.ts',
        'prompts/dynamic-style.d.md.ts',
        'prompts/partials/guidelines.d.md.ts',
        'prompts/partials/voice.d.md.ts',
      ])
      const declaration = readFileSync(join(dir, 'prompts/compile-brief.d.md.ts'), 'utf-8')
      expect(declaration).toContain('export interface CompileBriefParams')
      expect(declaration).toContain('transcript: string')
      expect(declaration).toContain('attempt?: number')
      expect(existsSync(join(dir, 'prompts/partials/voice.d.md.ts'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('write: false returns declarations without touching disk', () => {
    const entries = typegen('prompts/*.md', {
      cwd: join(import.meta.dir, 'fixtures'),
      write: false,
    })
    expect(entries.length).toBe(2)
    expect(entries.every((entry) => !existsSync(entry.declarationFile))).toBe(true)
  })
})
