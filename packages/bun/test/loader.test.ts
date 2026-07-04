import { describe, expect, test } from 'bun:test'
// Registers the .md loader (same as `preload = ["@markdown-di/bun/plugin"]` in
// bunfig.toml). Imports below are dynamic so they resolve after registration,
// which keeps this suite green when run from the workspace root too.
import '../src/plugin'

describe('bun loader', () => {
  test('importing a .md file yields a render function backed by frontmatter', async () => {
    const mod = await import('./fixtures/prompts/compile-brief.md')
    expect(typeof mod.default).toBe('function')

    const prompt = mod.default({
      transcript: 'We need cheaper vouchers.',
      productName: 'Jig',
    })
    expect(prompt).toContain('# Compile a brief for Jig')
    expect(prompt).toContain('We need cheaper vouchers.')
    expect(prompt).not.toContain('This is attempt') // optional section skipped
    expect(prompt.startsWith('---')).toBe(false) // frontmatter stripped from output
  })

  test('partials and $parent scoping work through the loader', async () => {
    const mod = await import('./fixtures/prompts/compile-brief.md')
    const prompt = mod.default({ transcript: 't', productName: 'Jig' })
    expect(prompt).toContain('## Guidelines for Jig') // partial frontmatter + $parent
    expect(prompt).toContain('internal audience') // partial-local variable
    expect(prompt).toContain('Use an active voice.') // frontmatter-less partial, verbatim
  })

  test('named exports: frontmatter and source', async () => {
    const mod = await import('./fixtures/prompts/compile-brief.md')
    expect(mod.frontmatter.name).toBe('compile-brief')
    expect(mod.frontmatter.params).toEqual({
      transcript: 'string',
      productName: 'string',
      'attempt?': 'number',
    })
    expect(mod.source.startsWith('---')).toBe(true)
  })

  test('optional param renders its guarded section when provided', async () => {
    const mod = await import('./fixtures/prompts/compile-brief.md')
    const prompt = mod.default({ transcript: 't', productName: 'Jig', attempt: 2 })
    expect(prompt).toContain('This is attempt 2')
  })

  test('$dynamic fields declare required params', async () => {
    const mod = await import('./fixtures/prompts/dynamic-style.md')
    expect(mod.default({ transcript: 'hello' })).toContain('hello')
    expect(() => mod.default()).toThrow('missing required param "transcript"')
  })

  test('strict mode throws through the loader for a missing required param', async () => {
    const mod = await import('./fixtures/prompts/compile-brief.md')
    expect(() => mod.default({ transcript: 't' })).toThrow('missing required param "productName"')
  })

  test('markdown without frontmatter imports verbatim and declares no params', async () => {
    const mod = await import('./fixtures/static.md')
    expect(mod.default()).toContain('# Just markdown')
    expect(mod.frontmatter).toEqual({})
    expect(() => mod.default({ anything: 1 })).toThrow('declares no params')
  })
})
