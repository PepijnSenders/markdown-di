import { describe, expect, test } from 'bun:test'
import { MarkdownDI } from '../src/index'

describe('Simple Demo - Mustache + Partials', () => {
  test('demonstrates the complete workflow', async () => {
    const content = `---
name: blog-post-demo
title: My Blog Post
author:
  name: John Doe
  email: john@example.com
tags:
  - javascript
  - markdown
  - tutorial
---

# {{title}}

By {{author.name}} ({{author.email}})

## Tags
{{#tags}}
- {{.}}
{{/tags}}

## Conclusion

That's all folks!
`

    const mdi = new MarkdownDI()
    const result = await mdi.process({
      content,
      baseDir: './test',
    })

    console.log('\n=== Processed Content ===\n')
    console.log(result.content)
    console.log('\n=== Errors ===\n')
    console.log(result.errors)

    expect(result.content).toMatchInlineSnapshot(`
      "---
      name: blog-post-demo
      title: My Blog Post
      author:
        name: John Doe
        email: john@example.com
      tags:
        - javascript
        - markdown
        - tutorial
      ---

      # My Blog Post

      By John Doe (john@example.com)

      ## Tags
      - javascript
      - markdown
      - tutorial

      ## Conclusion

      That's all folks!
      "
    `)

    // No errors since we removed the partial reference
    expect(result.errors).toEqual([])
  })
})
