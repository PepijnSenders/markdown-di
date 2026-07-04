import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MarkdownDI } from '../src/index'

const TEST_DIR = './test-tmp-strict'

describe('strict variable mode', () => {
  const mdi = new MarkdownDI()

  beforeAll(() => {
    mkdirSync(join(TEST_DIR, 'sections'), { recursive: true })
    writeFileSync(
      join(TEST_DIR, 'sections/header.md'),
      `---
title: Header
---

# {{title}} for {{productName}}

{{typoInPartial}}
`,
    )
    writeFileSync(join(TEST_DIR, 'sections/plain.md'), '# Plain partial, no frontmatter\n')
  })

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  const typoDoc = `---
name: strict-doc
description: Document with a typo
greeting: hello
---

{{greting}} world
`

  test('default mode: unknown variables silently render as empty string', async () => {
    const result = await mdi.process({ content: typoDoc, baseDir: TEST_DIR })

    expect(result.errors).toEqual([])
    expect(result.content).toContain(' world')
    expect(result.content).not.toContain('{{greting}}')
  })

  test('strict mode: unknown variables produce injection errors', async () => {
    const result = await mdi.process({ content: typoDoc, baseDir: TEST_DIR, strict: true })

    const error = result.errors.find((e) => e.type === 'injection')
    expect(error).toBeDefined()
    expect(error?.message).toContain('{{greting}}')
    // Source-relative: {{greting}} is on line 7 of the document
    expect(error?.location).toBe('line 7, column 0')
  })

  test('strict mode: known variables and partials pass', async () => {
    const content = `---
name: strict-doc
description: All variables defined
greeting: hello
partials:
  plain: sections/plain.md
---

{{greeting}} world

{{partials.plain}}
`
    const result = await mdi.process({ content, baseDir: TEST_DIR, strict: true })

    expect(result.errors).toEqual([])
  })

  test('strict mode: sections over declared keys are allowed, undeclared sections error', async () => {
    const content = `---
name: strict-doc
description: Sections
team:
  - name: Alice
  - name: Bob
draft: false
---

{{#team}}- {{name}}
{{/team}}
{{^draft}}Not a draft.{{/draft}}
{{#missing}}nope{{/missing}}
`
    const result = await mdi.process({ content, baseDir: TEST_DIR, strict: true })

    expect(result.errors.length).toBe(1)
    expect(result.errors[0].message).toContain('{{#missing}}')
  })

  test('strict mode: typos inside section bodies are checked against pushed frames', async () => {
    const content = `---
name: strict-doc
description: Section body typo
team:
  - name: Alice
---

{{#team}}- {{nmae}}
{{/team}}
`
    const result = await mdi.process({ content, baseDir: TEST_DIR, strict: true })

    expect(result.errors.some((e) => e.message.includes('{{nmae}}'))).toBe(true)
  })

  test('strict mode: partial bodies are checked against their merged context', async () => {
    const content = `---
name: strict-doc
description: Uses a partial with a typo
productName: Jig
partials:
  header: sections/header.md
---

{{partials.header}}
`
    const result = await mdi.process({ content, baseDir: TEST_DIR, strict: true })

    // {{title}} (own frontmatter) and {{productName}} (parent context) resolve;
    // {{typoInPartial}} does not
    const injectionErrors = result.errors.filter((e) => e.type === 'injection')
    expect(injectionErrors.length).toBe(1)
    expect(injectionErrors[0].message).toContain('{{typoInPartial}}')
    expect(injectionErrors[0].location).toContain('sections/header.md')
  })

  test('strict mode: native mustache partials are rejected', async () => {
    const content = `---
name: strict-doc
description: Native partial
---

{{> header}}
`
    const result = await mdi.process({ content, baseDir: TEST_DIR, strict: true })

    expect(
      result.errors.some((e) => e.type === 'injection' && e.message.includes('{{> header}}')),
    ).toBe(true)
  })

  test('strict mode respects custom delimiters', async () => {
    const content = `---
name: strict-doc
description: Custom delimiters
greeting: hello
---

<% greting %> and literal {{ not-a-tag }}
`
    const result = await mdi.process({
      content,
      baseDir: TEST_DIR,
      strict: true,
      mustache: { tags: ['<%', '%>'] },
    })

    const injectionErrors = result.errors.filter((e) => e.type === 'injection')
    expect(injectionErrors.length).toBe(1)
    expect(injectionErrors[0].message).toContain('greting')
  })
})
