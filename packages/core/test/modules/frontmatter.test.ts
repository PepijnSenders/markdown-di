import { describe, expect, test } from 'bun:test'
import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'
import { RenderError } from '../../src/modules/errors'
import { parseFrontmatter } from '../../src/modules/frontmatter'

/** The split @markdown-di/bun used before: gray-matter with the yaml engine. */
function grayMatter(source: string) {
  const parsed = matter(source, { engines: { yaml: (input: string) => parseYaml(input) } })
  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    return { frontmatter: {}, body: source, hasFrontmatter: false }
  }
  return { frontmatter: parsed.data, body: parsed.content, hasFrontmatter: true }
}

const CASES: Record<string, string> = {
  'no frontmatter': '# Title\n\nBody\n',
  'typical block': '---\ntitle: Hello\ntags: [a, b]\n---\n\n# {{title}}\n',
  'body right after the delimiter': '---\na: 1\n---\nbody',
  'thematic break, not a delimiter': '----\na: 1\n----\nbody',
  'empty block': '---\n---\nbody\n',
  'comment-only block': '---\n# just a comment\n---\nbody\n',
  'no closing delimiter': '---\na: 1\n',
  'CRLF line endings': '---\r\na: 1\r\nb: two\r\n---\r\nbody\r\n',
  'byte order mark': '﻿---\na: 1\n---\nbody',
  'explicit yaml language': '---yaml\na: 1\n---\nbody',
  'nested structures': '---\nroutes:\n  - id: x\n    to: [y, z]\nflag: true\nn: 3\n---\nbody',
  'a later --- in the body': '---\na: 1\n---\nbody\n\n---\n\nmore',
}

describe('parseFrontmatter matches gray-matter', () => {
  for (const [name, source] of Object.entries(CASES)) {
    test(name, () => {
      const { frontmatter, body, hasFrontmatter } = parseFrontmatter(source, '/x.md')
      expect({ frontmatter, body, hasFrontmatter }).toEqual(grayMatter(source))
    })
  }
})

describe('parseFrontmatter is strict and positional', () => {
  const failure = (source: string): RenderError => {
    try {
      parseFrontmatter(source, '/cards/x.md')
    } catch (error) {
      expect(error).toBeInstanceOf(RenderError)
      return error as RenderError
    }
    throw new Error('expected a RenderError')
  }

  test('a YAML syntax error reports the file line', () => {
    const error = failure('---\nid: a\nname: [b\nkind: c\n---\n')
    expect(error.code).toBe('invalid-frontmatter')
    expect(error.line).toBe(4)
    expect(error.message).toEndWith('(/cards/x.md:4)')
  })

  test('a duplicate key reports the line of the duplicate', () => {
    const error = failure('---\nid: a\nname: b\nid: c\n---\n')
    expect(error.message).toContain('Map keys must be unique')
    expect(error.line).toBe(4)
  })

  test('a scalar root is not frontmatter', () => {
    const error = failure('---\njust a string\n---\n')
    expect(error.message).toContain('must be a YAML mapping')
    expect(error.line).toBe(2)
  })

  test('a non-YAML language is rejected', () => {
    expect(failure('---toml\na = 1\n---\n').message).toContain('unsupported frontmatter language')
  })

  test('bodyLine and keyLines point into the source file', () => {
    const document = parseFrontmatter('---\nid: a\n\nroutes:\n  - x\n---\n\n# Title\n', '/x.md')
    expect(document.keyLines).toEqual({ id: 2, routes: 4 })
    expect(document.bodyLine).toBe(7)
    expect(document.body.split('\n')[1]).toBe('# Title')
  })
})
