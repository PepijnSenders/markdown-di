import { describe, expect, test } from 'bun:test'
import { MarkdownDI, PartialValidator } from '../src/index'

describe('PartialValidator (Mustache-based syntax validation)', () => {
  const validator = new PartialValidator()

  test('does not flag triple-brace tags (the transclusion syntax)', () => {
    const errors = validator.validate('# Doc\n\n{{{partials.intro}}}\n\n{{{unescaped}}}\n')
    expect(errors).toEqual([])
  })

  test('does not flag sections, inverted sections, and comments', () => {
    const errors = validator.validate(
      '{{#list}}{{.}}{{/list}}\n{{^empty}}none{{/empty}}\n{{! a comment }}\n',
    )
    expect(errors).toEqual([])
  })

  test('flags unclosed tags', () => {
    const errors = validator.validate('line one\nline two {{unclosed\n')
    expect(errors.length).toBe(1)
    expect(errors[0].type).toBe('syntax')
    expect(errors[0].message).toContain('Unclosed tag')
  })

  test('flags unclosed sections', () => {
    const errors = validator.validate('{{#section}}\nnever closed\n')
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('Unclosed section')
  })

  test('flags invalid characters in tag names', () => {
    const errors = validator.validate('{{invalid{nested}}}\n')
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('Invalid characters in partial reference')
  })

  test('respects custom delimiters', () => {
    // With <% %> delimiters, stray {{ }} are plain text
    expect(validator.validate('{{ not a tag\n<%valid%>\n', { tags: ['<%', '%>'] })).toEqual([])
    // ...and unclosed custom tags are flagged
    const errors = validator.validate('<%unclosed\n', { tags: ['<%', '%>'] })
    expect(errors.length).toBe(1)
    expect(errors[0].message).toContain('Unclosed tag')
  })

  test('applies the line offset so locations are source-relative', () => {
    const errors = validator.validate('\n{{bad{chars}}\n', { lineOffset: 4 })
    expect(errors.length).toBe(1)
    // Body line 2 + offset 4 = source line 6
    expect(errors[0].location).toBe('line 6, column 0')
  })

  test('reports source-relative line numbers through MarkdownDI.process', async () => {
    const mdi = new MarkdownDI()
    const content = `---
name: doc
description: Bad tag below
---

{{invalid{chars}}}
`
    const result = await mdi.process({ content, baseDir: '.', mode: 'validate' })
    const syntaxErrors = result.errors.filter((e) => e.type === 'syntax')
    expect(syntaxErrors.length).toBe(1)
    // {{invalid{chars}}} is on line 6 of the source file
    expect(syntaxErrors[0].location).toBe('line 6, column 0')
  })

  test('custom delimiters flow through MarkdownDI.process to validation', async () => {
    const mdi = new MarkdownDI()
    const content = `---
name: doc
description: Literal braces with custom delimiters
---

Literal {{ braces }} are fine here.
`
    const result = await mdi.process({
      content,
      baseDir: '.',
      mode: 'validate',
      mustache: { tags: ['<%', '%>'] },
    })
    expect(result.errors.filter((e) => e.type === 'syntax')).toEqual([])
  })
})
