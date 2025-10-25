import { describe, expect, test } from 'bun:test'
import { MarkdownDI } from '../src/index'

describe('Mustache Templating', () => {
  test('should interpolate simple frontmatter variables', async () => {
    const content = `---
name: John Doe
age: 30
city: San Francisco
---

# Profile

Name: {{name}}
Age: {{age}}
City: {{city}}
`

    const mdi = new MarkdownDI()
    const result = await mdi.process({
      content,
      baseDir: './test',
    })

    expect(result.errors.length).toBe(0)
    expect(result.content).toContain('Name: John Doe')
    expect(result.content).toContain('Age: 30')
    expect(result.content).toContain('City: San Francisco')
  })

  test('should access nested object properties', async () => {
    const content = `---
name: Test Doc
author:
  name: Jane Smith
  email: jane@example.com
  company:
    name: Acme Inc
---

# Document by {{author.name}}

Email: {{author.email}}
Company: {{author.company.name}}
`

    const mdi = new MarkdownDI()
    const result = await mdi.process({
      content,
      baseDir: './test',
    })

    expect(result.errors.length).toBe(0)
    expect(result.content).toContain('Document by Jane Smith')
    expect(result.content).toContain('Email: jane@example.com')
    expect(result.content).toContain('Company: Acme Inc')
  })

  test('should handle arrays with sections', async () => {
    const content = `---
name: Team List
team:
  - name: Alice
    role: Developer
  - name: Bob
    role: Designer
  - name: Charlie
    role: Manager
---

# Team Members

{{#team}}
- **{{name}}** - {{role}}
{{/team}}
`

    const mdi = new MarkdownDI()
    const result = await mdi.process({
      content,
      baseDir: './test',
    })

    expect(result.errors.length).toBe(0)
    expect(result.content).toContain('**Alice** - Developer')
    expect(result.content).toContain('**Bob** - Designer')
    expect(result.content).toContain('**Charlie** - Manager')
  })

  test('should handle partials for file injection', async () => {
    const content = `---
name: Test Doc
description: Document with partial
partials:
  intro: test/fixtures/intro.md
---

# Test Document

{{partials.intro}}

## Regular Variable

Author: {{name}}
`

    const mdi = new MarkdownDI()
    const result = await mdi.process({
      content,
      baseDir: './test',
    })

    // Should have an error because the file doesn't exist
    // But the Mustache variable {{name}} should still work
    expect(result.content).toContain('Author: Test Doc')
  })
})
