import { describe, expect, test } from 'bun:test'
import type { SpanMapping } from '../src/protocol'
import { transformMarkdown } from '../src/transform'

const BRIEF = `---
params:
  transcript: string
  attempt?: number
  rows: [{ id: string, note?: string }]
---
Summarize {{transcript}}.
`

const utf8 = new TextEncoder()
const utf8Slice = (text: string, start: number, length: number) =>
  new TextDecoder().decode(utf8.encode(text).slice(start, start + length))

const spans = (
  virtual: string,
  original: string,
  mappings: SpanMapping[] | undefined,
  slice = (text: string, start: number, length: number) => text.slice(start, start + length),
) =>
  (mappings ?? []).map(([virtualStart, virtualLength, originalStart, originalLength]) => [
    slice(virtual, virtualStart, virtualLength),
    slice(original, originalStart, originalLength),
  ])

describe('transformMarkdown', () => {
  test('a template becomes its typed render declaration', () => {
    const result = transformMarkdown({ fileName: '/virtual/compile-brief.md', content: BRIEF })
    expect(result.extension).toBe('.ts')
    expect(result.diagnostics).toBeUndefined()
    expect(result.text).toMatchSnapshot()
  })

  test('the content wins over the disk', () => {
    const result = transformMarkdown({
      fileName: `${import.meta.dir}/does-not-exist.md`,
      content: '---\nparams:\n  topic: string\n---\n{{topic}}\n',
    })
    expect(result.text).toContain('declare function render(params: DoesNotExistParams): string')
  })

  test('each top-level param maps to its key in the frontmatter', () => {
    const result = transformMarkdown({ fileName: '/virtual/compile-brief.md', content: BRIEF })
    expect(spans(result.text, BRIEF, result.mappings)).toEqual([
      ['transcript', 'transcript'],
      ['attempt', 'attempt'],
      ['rows', 'rows'],
    ])
  })

  test('utf-8 positions count bytes on both sides', () => {
    const content = BRIEF.replace('params:', '# café\nparams:')
    const result = transformMarkdown({
      fileName: '/virtual/compile-brief.md',
      content,
      positionEncoding: 'utf-8',
    })
    expect(spans(result.text, content, result.mappings, utf8Slice)).toEqual([
      ['transcript', 'transcript'],
      ['attempt', 'attempt'],
      ['rows', 'rows'],
    ])
  })

  test('a $dynamic field maps to its top-level key', () => {
    const content = '---\nstyle: $dynamic\n---\n{{style}}\n'
    const result = transformMarkdown({ fileName: '/virtual/styled.md', content })
    expect(spans(result.text, content, result.mappings)).toEqual([['style', 'style']])
  })

  test('a flow-style params block is typed without mappings', () => {
    const content = '---\nparams: { topic: string }\n---\n{{topic}}\n'
    const result = transformMarkdown({ fileName: '/virtual/flow.md', content })
    expect(result.text).toContain('topic: string')
    expect(result.mappings).toEqual([])
  })

  test('a data file becomes its literal frontmatter type', () => {
    const content = '---\nexport: data\nid: framed\nsteps: [a, b]\n---\n# Framed\n'
    const result = transformMarkdown({ fileName: '/virtual/framed.md', content })
    expect(result.text).toContain('readonly id: "framed"')
    expect(result.text).toContain('readonly steps: readonly ["a", "b"]')
    expect(result.mappings).toEqual([])
  })

  test('malformed frontmatter is a diagnostic on its line, and the module stays importable', () => {
    const content = '---\nparams:\n  topic: string\n  topic: number\n---\n{{topic}}\n'
    const result = transformMarkdown({ fileName: '/virtual/dupe.md', content })
    expect(result.text).toContain('declare function render(params?: Record<string, unknown>)')
    const [diagnostic] = result.diagnostics ?? []
    expect(diagnostic.code).toBe(1001)
    expect(diagnostic.messageText).toStartWith('invalid YAML frontmatter: Map keys must be unique')
    expect(diagnostic.messageText).not.toContain('/virtual/dupe.md')
    expect(content.slice(diagnostic.start, diagnostic.start + diagnostic.length)).toBe(
      '  topic: number',
    )
  })

  test('a declaration error without a line is reported on the params key', () => {
    const content = '---\ntitle: x\nparams:\n  a: strin\n---\nx\n'
    const result = transformMarkdown({ fileName: '/virtual/typo.md', content })
    const [diagnostic] = result.diagnostics ?? []
    expect(diagnostic.code).toBe(1002)
    expect(diagnostic.messageText).toStartWith('param "a" has unsupported type "strin"')
    expect(diagnostic.messageText).not.toContain('/virtual/typo.md')
    expect(content.slice(diagnostic.start, diagnostic.start + diagnostic.length)).toBe('params:')
  })
})
