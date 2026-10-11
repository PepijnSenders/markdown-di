import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { RenderError } from '../src/errors'
import { createRenderer } from '../src/render'
import { generateDeclaration } from '../src/typegen'

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

const report = () => createRenderer(fixture('records/report.md'))

const valid = {
  title: 'Outcome',
  owner: { name: 'Ada' },
  rows: [
    { id: 'M-1', verdict: 'kept', note: 'on target', tags: ['a'] },
    { id: 'M-2', verdict: 'missed', tags: [] },
  ],
}

describe('record params', () => {
  test('renders records and lists of records', () => {
    expect(report().render(valid)).toBe(
      [
        '# Outcome',
        '',
        'Owned by Ada.',
        '',
        '| ID | Verdict | Note |',
        '| --- | --- | --- |',
        '| M-1 | **kept** | on target |',
        '| M-2 | **missed** | — |',
      ].join('\n'),
    )
  })

  test('an absent optional field does not fall through to an outer frame', () => {
    const rendered = report().render({
      ...valid,
      target: 'outer',
      rows: [{ id: 'M-3', verdict: 'early', tags: [] }],
    })
    expect(rendered).toContain('| M-3 | **early** | — |')
  })

  test('renders a nested optional field when present', () => {
    expect(report().render({ ...valid, owner: { name: 'Ada', team: 'Core' } })).toContain(
      'Owned by Ada (Core).',
    )
  })

  test('throws on a missing required field with its path', () => {
    const error = failure(() => report().render({ ...valid, rows: [{ id: 'M-1', tags: [] }] }))
    expect(error.code).toBe('missing-param')
    expect(error.message).toContain('missing required field "rows[0].verdict" (string)')
  })

  test('throws on an undeclared field', () => {
    const error = failure(() =>
      report().render({ ...valid, owner: { name: 'Ada', email: 'a@b.c' } }),
    )
    expect(error.code).toBe('unknown-param')
    expect(error.message).toContain('unknown field "owner.email" — declared fields: name, team')
  })

  test('throws on a wrong field type with its path', () => {
    const error = failure(() =>
      report().render({ ...valid, rows: [{ id: 'M-1', verdict: 2, tags: [] }] }),
    )
    expect(error.code).toBe('wrong-type')
    expect(error.message).toContain('param "rows[0].verdict" expected string, got number')
  })

  test('throws when a record is not an object', () => {
    const error = failure(() => report().render({ ...valid, owner: 'Ada' }))
    expect(error.code).toBe('wrong-type')
    expect(error.message).toContain(
      'param "owner" expected { name: string; team?: string }, got string',
    )
  })

  test('a list declaration takes exactly one item type', () => {
    const error = failure(() => createRenderer(fixture('records/bad-declaration.md')))
    expect(error.code).toBe('invalid-declaration')
    expect(error.message).toContain('param "rows" has unsupported type')
  })

  test('typegen emits readonly record and list types', () => {
    expect(generateDeclaration(fixture('records/report.md'))).toMatchSnapshot()
  })
})
