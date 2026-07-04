import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { RenderError } from '../src/errors'
import { createRenderer } from '../src/render'

const fixture = (name: string) => join(import.meta.dir, 'fixtures', name)

const failure = (fn: () => unknown): RenderError => {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(RenderError)
    return error as RenderError
  }
  throw new Error('expected the render to throw')
}

describe('strict params', () => {
  const brief = () => createRenderer(fixture('prompts/compile-brief.md'))

  test('throws on a param that is not declared in frontmatter', () => {
    const error = failure(() =>
      brief().render({ transcript: 't', productName: 'Jig', extra: 'nope' }),
    )
    expect(error.code).toBe('unknown-param')
    expect(error.message).toContain('unknown param "extra"')
    expect(error.message).toContain('declared params: transcript, productName, attempt')
  })

  test('throws on a missing required param', () => {
    const error = failure(() => brief().render({ productName: 'Jig' }))
    expect(error.code).toBe('missing-param')
    expect(error.message).toContain('missing required param "transcript" (string)')
  })

  test('throws on a type mismatch', () => {
    const error = failure(() =>
      brief().render({ transcript: 't', productName: 'Jig', attempt: 'two' }),
    )
    expect(error.code).toBe('wrong-type')
    expect(error.message).toContain('param "attempt" expected number, got string')
  })

  test('accepts declared optional params being absent', () => {
    expect(brief().render({ transcript: 't', productName: 'Jig' })).toContain('## Transcript')
  })
})

describe('strict tags', () => {
  test('throws on a body tag that is not a frontmatter field or declared param', () => {
    const error = failure(() =>
      createRenderer(fixture('strict/undeclared-tag.md')).render({ topic: 'x' }),
    )
    expect(error.code).toBe('unresolved-tag')
    expect(error.message).toContain('{{oops}} does not resolve')
  })

  test('throws when an optional param is interpolated bare but not provided', () => {
    const error = failure(() => createRenderer(fixture('strict/optional-interpolated.md')).render())
    expect(error.code).toBe('unresolved-tag')
    expect(error.message).toContain('optional param "topic" was not provided')
  })

  test('throws when a provided value is an empty string', () => {
    const error = failure(() =>
      createRenderer(fixture('strict/undeclared-tag.md')).render({ topic: '   ' }),
    )
    expect(error.code).toBe('unresolved-tag')
    expect(error.message).toContain('{{topic}} would render as nothing')
  })

  test('sections over absent optional params are allowed (intentional no-op)', () => {
    const output = createRenderer(fixture('strict/sections.md')).render({ topic: 'x' })
    expect(output).toContain('Topic: x')
    expect(output).toContain('No tags were provided.') // inverted section
    expect(output).not.toContain('urgent')
  })

  test('array params render inside sections and are checked per element', () => {
    const output = createRenderer(fixture('strict/sections.md')).render({
      topic: 'x',
      tags: ['a', 'b'],
      urgent: true,
    })
    expect(output).toContain('- a')
    expect(output).toContain('- b')
    expect(output).toContain('Treat this as urgent.')
    expect(output).not.toContain('No tags were provided.')
  })

  test('rejects native mustache partials', () => {
    const error = failure(() => createRenderer(fixture('strict/mustache-partial.md')).render())
    expect(error.code).toBe('unsupported-tag')
    expect(error.message).toContain('{{> native-partial}}')
  })
})

describe('strict partials', () => {
  test('throws on an unresolved tag inside a transcluded partial', () => {
    const error = failure(() => createRenderer(fixture('strict/partial-bad-tag.md')).render())
    expect(error.code).toBe('unresolved-tag')
    expect(error.message).toContain('{{missing}}')
    expect(error.message).toContain('partials/bad.md')
  })

  test('throws when $parent references a key the parent does not have', () => {
    const error = failure(() => createRenderer(fixture('strict/parent-missing.md')).render())
    expect(error.code).toBe('unresolved-tag')
    expect(error.message).toContain('parent context has no key "nope"')
  })

  test('throws on circular partial inclusion', () => {
    const error = failure(() => createRenderer(fixture('strict/circular-a.md')).render())
    expect(error.code).toBe('circular-partial')
    expect(error.message).toContain('circular partial inclusion')
  })

  test('throws when a partial file is missing', () => {
    const error = failure(() => createRenderer(fixture('strict/missing-partial.md')).render())
    expect(error.code).toBe('partial-not-found')
    expect(error.message).toContain('partials/does-not-exist.md')
  })

  test('throws when a transcluded partial resolves to nothing', () => {
    const error = failure(() => createRenderer(fixture('strict/empty-partial.md')).render())
    expect(error.code).toBe('unresolved-tag')
    expect(error.message).toContain('{{partials.nothing}} would render as nothing')
  })

  test('a partial that is blank because of its own conditional sections is allowed', () => {
    // The partial's whole body is {{#note}}…{{/note}} — with `note` absent it
    // renders nothing, which is control flow, not a silent bug.
    const { render } = createRenderer(fixture('strict/conditional-partial.md'))
    expect(render()).toBe('Before.\n\nAfter.')
    expect(render({ note: 'steer left' })).toBe('Before.\nNOTE: steer left\nAfter.')
  })

  test('glob partials transclude every match, sorted, with $parent scoping', () => {
    const output = createRenderer(fixture('strict/glob-partials.md')).render({
      productName: 'Jig',
    })
    expect(output.indexOf('First rule.')).toBeLessThan(output.indexOf('Second rule for Jig.'))
  })
})
