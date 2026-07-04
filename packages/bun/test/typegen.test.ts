import { describe, expect, test } from 'bun:test'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { generateDeclaration, generateSingleFileDeclaration, typegen } from '../src/typegen'

const fixture = (name: string) => join(import.meta.dir, 'fixtures', name)

const withTempDir = <T>(run: (dir: string) => T): T => {
  const dir = mkdtempSync(join(tmpdir(), 'markdown-di-typegen-'))
  try {
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

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

describe('typegen single-file mode', () => {
  test('single-file output for multiple templates matches snapshot', () => {
    // Required + optional params, a $dynamic param, and a no-params template.
    const contents = generateSingleFileDeclaration([
      fixture('prompts/compile-brief.md'),
      fixture('prompts/dynamic-style.md'),
      fixture('static.md'),
    ])
    expect(contents).toMatchSnapshot()
  })

  test('includeFallback appends the generic blocks after the per-template blocks', () => {
    const contents = generateSingleFileDeclaration([fixture('static.md')], {
      includeFallback: true,
    })
    // Ambient wildcard ties break by declaration order, so the generic fallback
    // must come last for the per-template blocks to win.
    expect(contents.indexOf("declare module '*static.md'")).toBeLessThan(
      contents.indexOf("declare module '*.md'"),
    )
    expect(contents).toContain("declare module '*.markdown'")
  })

  test('typegen writes one declaration file and no siblings', () => {
    withTempDir((dir) => {
      cpSync(fixture('prompts'), join(dir, 'prompts'), { recursive: true })
      const entries = typegen('prompts/**/*.md', { cwd: dir, singleFile: 'types/markdown.d.ts' })

      const outFile = join(dir, 'types/markdown.d.ts')
      expect(entries.map((entry) => relative(dir, entry.file))).toEqual([
        'prompts/compile-brief.md',
        'prompts/dynamic-style.md',
        'prompts/partials/guidelines.md',
        'prompts/partials/voice.md',
      ])
      expect(new Set(entries.map((entry) => entry.declarationFile))).toEqual(new Set([outFile]))

      const written = readFileSync(outFile, 'utf-8')
      expect(written).toBe(entries[0].contents)
      expect(written).toContain("declare module '*compile-brief.md'")
      expect(written).toContain('export interface CompileBriefParams')
      // No generic fallback unless asked for, and no sibling files.
      expect(written).not.toContain("declare module '*.md'")
      expect(existsSync(join(dir, 'prompts/compile-brief.d.md.ts'))).toBe(false)
      expect(existsSync(join(dir, 'prompts/partials/voice.d.md.ts'))).toBe(false)
    })
  })

  test('duplicate basenames fail listing every offender', () => {
    withTempDir((dir) => {
      mkdirSync(join(dir, 'a'))
      mkdirSync(join(dir, 'b'))
      writeFileSync(join(dir, 'a/compile.md'), '# a\n')
      writeFileSync(join(dir, 'b/compile.md'), '# b\n')

      let error: Error | undefined
      try {
        typegen('**/*.md', { cwd: dir, singleFile: 'types.d.ts', write: false })
      } catch (caught) {
        error = caught as Error
      }
      expect(error?.message).toContain('unique template basenames')
      expect(error?.message).toContain(join(dir, 'a/compile.md'))
      expect(error?.message).toContain(join(dir, 'b/compile.md'))
      expect(existsSync(join(dir, 'types.d.ts'))).toBe(false)
    })
  })

  test('a basename that is a proper suffix of another fails listing the pair', () => {
    withTempDir((dir) => {
      writeFileSync(join(dir, 'narrate.md'), '# narrate\n')
      writeFileSync(join(dir, 'self-narrate.md'), '# self-narrate\n')

      let error: Error | undefined
      try {
        typegen('*.md', { cwd: dir, singleFile: 'types.d.ts', write: false })
      } catch (caught) {
        error = caught as Error
      }
      expect(error?.message).toContain('proper suffix')
      expect(error?.message).toContain("'narrate.md' is a proper suffix of 'self-narrate.md'")
      expect(error?.message).toContain(join(dir, 'narrate.md'))
      expect(error?.message).toContain(join(dir, 'self-narrate.md'))
    })
  })

  test('stale sibling declarations are left alone but warned about', () => {
    withTempDir((dir) => {
      writeFileSync(join(dir, 'narrate.md'), '# narrate\n')
      writeFileSync(join(dir, 'other.md'), '# other\n')
      writeFileSync(join(dir, 'narrate.d.md.ts'), '// stale\n')

      const warnings: string[] = []
      typegen('*.md', {
        cwd: dir,
        singleFile: 'types.d.ts',
        warn: (message) => warnings.push(message),
      })

      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain(join(dir, 'narrate.d.md.ts'))
      expect(warnings[0]).not.toContain(join(dir, 'other.d.md.ts'))
      // The stale sibling is reported, not rewritten or deleted.
      expect(readFileSync(join(dir, 'narrate.d.md.ts'), 'utf-8')).toBe('// stale\n')
      expect(existsSync(join(dir, 'types.d.ts'))).toBe(true)
    })
  })

  test('a generated single file type-checks a consumer under tsc', () => {
    withTempDir((dir) => {
      cpSync(fixture('single-file'), dir, { recursive: true })
      typegen(['narrate.md', 'plain.md'], {
        cwd: dir,
        singleFile: 'md-types.d.ts',
        includeFallback: true,
      })

      const tscBin = Bun.resolveSync('typescript/bin/tsc', import.meta.dir)
      const result = Bun.spawnSync([process.execPath, tscBin, '-p', dir], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const output = `${result.stdout.toString()}${result.stderr.toString()}`
      expect(output.trim()).toBe('')
      expect(result.exitCode).toBe(0)
    })
  })
})
