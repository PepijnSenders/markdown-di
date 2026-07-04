import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RenderError } from '../src/errors'
import { createRenderer } from '../src/render'

const FIXTURES = join(import.meta.dir, 'fixtures', 'shared-root')

function expectRenderError(fn: () => unknown, code: string, message: string | RegExp) {
  let caught: unknown
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(RenderError)
  expect((caught as RenderError).code).toBe(code)
  if (typeof message === 'string') {
    expect((caught as RenderError).message).toContain(message)
  } else {
    expect((caught as RenderError).message).toMatch(message)
  }
}

describe('shared partials root (`~/` + .markdown-di.json)', () => {
  test('`~/` paths resolve against the configured root; relative paths stay file-local', () => {
    const { render } = createRenderer(join(FIXTURES, 'workflows/a/prompt.md'))
    const out = render({ topic: 'Roots' })
    expect(out).toBe(
      ['# Roots', '', 'Use an active voice.', '', 'Write for engineers.', '', 'Local note.'].join(
        '\n',
      ),
    )
  })

  test('the config is discovered by walking up multiple directory levels', () => {
    const { render } = createRenderer(join(FIXTURES, 'workflows/b/deep/prompt.md'))
    expect(render()).toBe('Nested says: Use an active voice.')
  })

  test('a shared partial may itself declare `~/` partials (root anchored at the entry file)', () => {
    // Covered by the deep fixture: nested.md lives in the root and transcludes ~/voice.md.
    const { render } = createRenderer(join(FIXTURES, 'workflows/b/deep/prompt.md'))
    expect(render()).toContain('Use an active voice.')
  })

  test('`~/` supports glob patterns under the root', () => {
    const { render } = createRenderer(join(FIXTURES, 'workflows/c/prompt.md'))
    expect(render()).toBe('First snippet.\n\n\nSecond snippet.')
  })

  test('traversal out of the partials root is rejected', () => {
    const { render } = createRenderer(join(FIXTURES, 'workflows/bad/escape.md'))
    expectRenderError(() => render(), 'invalid-declaration', 'path traversal not allowed')
  })

  test('a bare `~/` is rejected', () => {
    const { render } = createRenderer(join(FIXTURES, 'workflows/bad/bare.md'))
    expectRenderError(() => render(), 'invalid-declaration', 'needs a path under the partials root')
  })

  test('`~/` without any .markdown-di.json in scope fails with a pointer to the fix', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mdi-root-'))
    writeFileSync(
      join(dir, 'prompt.md'),
      '---\npartials:\n  x: ~/x.md\n---\n{{partials.x}}\n',
      'utf-8',
    )
    const { render } = createRenderer(join(dir, 'prompt.md'))
    expectRenderError(() => render(), 'invalid-declaration', 'no partials root is configured')
  })

  test('the nearest config is a boundary: one without partialsRoot means "no root"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mdi-root-'))
    writeFileSync(join(dir, '.markdown-di.json'), '{}\n', 'utf-8')
    const sub = join(dir, 'sub')
    mkdirSync(sub)
    writeFileSync(
      join(sub, 'prompt.md'),
      '---\npartials:\n  x: ~/x.md\n---\n{{partials.x}}\n',
      'utf-8',
    )
    const { render } = createRenderer(join(sub, 'prompt.md'))
    expectRenderError(() => render(), 'invalid-declaration', 'no partials root is configured')
  })

  test('a malformed .markdown-di.json fails loudly instead of being skipped', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mdi-root-'))
    writeFileSync(join(dir, '.markdown-di.json'), '{ not json', 'utf-8')
    writeFileSync(
      join(dir, 'prompt.md'),
      '---\npartials:\n  x: ~/x.md\n---\n{{partials.x}}\n',
      'utf-8',
    )
    const { render } = createRenderer(join(dir, 'prompt.md'))
    expectRenderError(() => render(), 'invalid-declaration', 'failed to parse .markdown-di.json')
  })

  test('a non-string partialsRoot is rejected', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mdi-root-'))
    writeFileSync(join(dir, '.markdown-di.json'), '{ "partialsRoot": 7 }\n', 'utf-8')
    writeFileSync(
      join(dir, 'prompt.md'),
      '---\npartials:\n  x: ~/x.md\n---\n{{partials.x}}\n',
      'utf-8',
    )
    const { render } = createRenderer(join(dir, 'prompt.md'))
    expectRenderError(
      () => render(),
      'invalid-declaration',
      '`partialsRoot` must be a non-empty string',
    )
  })

  test('a missing shared partial reports partial-not-found with the original pattern', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mdi-root-'))
    writeFileSync(join(dir, '.markdown-di.json'), '{ "partialsRoot": "shared" }\n', 'utf-8')
    mkdirSync(join(dir, 'shared'))
    writeFileSync(
      join(dir, 'prompt.md'),
      '---\npartials:\n  x: ~/missing.md\n---\n{{partials.x}}\n',
      'utf-8',
    )
    const { render } = createRenderer(join(dir, 'prompt.md'))
    expectRenderError(() => render(), 'partial-not-found', '~/missing.md')
  })

  test('absolute partial paths are still rejected when a root is configured', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mdi-root-'))
    writeFileSync(join(dir, '.markdown-di.json'), '{ "partialsRoot": "." }\n', 'utf-8')
    writeFileSync(
      join(dir, 'prompt.md'),
      `---\npartials:\n  x: ${join(dir, 'x.md')}\n---\n{{partials.x}}\n`,
      'utf-8',
    )
    writeFileSync(join(dir, 'x.md'), 'X\n', 'utf-8')
    const { render } = createRenderer(join(dir, 'prompt.md'))
    expectRenderError(() => render(), 'invalid-declaration', 'path traversal not allowed')
  })
})
