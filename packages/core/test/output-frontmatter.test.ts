import { describe, expect, it } from 'bun:test'
import matter from 'gray-matter'
import { MarkdownDI } from '../src/index'

describe('output-frontmatter filtering', () => {
  const processor = new MarkdownDI()

  it('should only include specified fields in output when output-frontmatter is present', async () => {
    const input = `---
name: Test Document
description: A test document
author: Internal Team
draft-notes: TODO review this
internal-id: ABC123
output-frontmatter:
  - name
  - description
---

# Content

This is the document body.`

    const result = await processor.process({
      content: input,
      baseDir: __dirname,
      mode: 'build',
    })

    expect(result.errors).toHaveLength(0)

    // Parse the output to check frontmatter
    const parsed = matter(result.content)

    expect(parsed.data).toHaveProperty('name', 'Test Document')
    expect(parsed.data).toHaveProperty('description', 'A test document')
    expect(parsed.data).not.toHaveProperty('author')
    expect(parsed.data).not.toHaveProperty('draft-notes')
    expect(parsed.data).not.toHaveProperty('internal-id')
    expect(parsed.data).not.toHaveProperty('output-frontmatter')
  })

  it('should include all fields when output-frontmatter is not present (backward compatibility)', async () => {
    const input = `---
name: Test Document
description: A test document
author: Internal Team
version: 1.0.0
---

# Content`

    const result = await processor.process({
      content: input,
      baseDir: __dirname,
      mode: 'build',
    })

    expect(result.errors).toHaveLength(0)

    const parsed = matter(result.content)

    expect(parsed.data).toHaveProperty('name', 'Test Document')
    expect(parsed.data).toHaveProperty('description', 'A test document')
    expect(parsed.data).toHaveProperty('author', 'Internal Team')
    expect(parsed.data).toHaveProperty('version', '1.0.0')
  })

  it('should exclude output-frontmatter field itself from output', async () => {
    const input = `---
name: Test Document
description: A test document
output-frontmatter:
  - name
  - description
  - output-frontmatter
---

# Content`

    const result = await processor.process({
      content: input,
      baseDir: __dirname,
      mode: 'build',
    })

    const parsed = matter(result.content)

    expect(parsed.data).toHaveProperty('name')
    expect(parsed.data).toHaveProperty('description')
    expect(parsed.data).not.toHaveProperty('output-frontmatter')
  })

  it('should handle empty output-frontmatter array', async () => {
    const input = `---
name: Test Document
description: A test document
author: Internal Team
output-frontmatter: []
---

# Content`

    const result = await processor.process({
      content: input,
      baseDir: __dirname,
      mode: 'build',
    })

    const parsed = matter(result.content)

    // Should have no frontmatter fields
    expect(Object.keys(parsed.data)).toHaveLength(0)
  })

  it('should silently ignore non-existent fields in output-frontmatter', async () => {
    const input = `---
name: Test Document
description: A test document
output-frontmatter:
  - name
  - description
  - nonExistentField
  - anotherFakeField
---

# Content`

    const result = await processor.process({
      content: input,
      baseDir: __dirname,
      mode: 'build',
    })

    expect(result.errors).toHaveLength(0)

    const parsed = matter(result.content)

    expect(parsed.data).toHaveProperty('name', 'Test Document')
    expect(parsed.data).toHaveProperty('description', 'A test document')
    expect(parsed.data).not.toHaveProperty('nonExistentField')
    expect(parsed.data).not.toHaveProperty('anotherFakeField')
    expect(Object.keys(parsed.data)).toHaveLength(2)
  })

  it('should work with partials field', async () => {
    const input = `---
name: Test Document
description: A test document
author: Internal Team
partials:
  header: ./fixtures/header.md
output-frontmatter:
  - name
  - description
  - partials
---

# Content`

    const result = await processor.process({
      content: input,
      baseDir: __dirname,
      mode: 'build',
    })

    const parsed = matter(result.content)

    expect(parsed.data).toHaveProperty('name')
    expect(parsed.data).toHaveProperty('description')
    expect(parsed.data).toHaveProperty('partials')
    expect(parsed.data).not.toHaveProperty('author')
  })

  it('should preserve body content while filtering frontmatter', async () => {
    const input = `---
name: Test Document
description: A test document
secret: do-not-show
output-frontmatter:
  - name
  - description
---

# Main Heading

This is important content that should be preserved.

- List item 1
- List item 2`

    const result = await processor.process({
      content: input,
      baseDir: __dirname,
      mode: 'build',
    })

    const parsed = matter(result.content)

    expect(parsed.content).toContain('# Main Heading')
    expect(parsed.content).toContain('This is important content')
    expect(parsed.content).toContain('- List item 1')
    expect(parsed.data).not.toHaveProperty('secret')
  })

  it('should handle output-frontmatter in validate mode', async () => {
    const input = `---
name: Test Document
description: A test document
internal-field: secret
output-frontmatter:
  - name
  - description
---

# Content`

    const result = await processor.validate({
      content: input,
      baseDir: __dirname,
    })

    // Validate mode should still work
    expect(result.errors).toHaveLength(0)

    // But the frontmatter filtering should still apply to the content output
    const parsed = matter(result.content)
    expect(parsed.data).toHaveProperty('name')
    expect(parsed.data).toHaveProperty('description')
    expect(parsed.data).not.toHaveProperty('internal-field')
  })

  it('should handle output-frontmatter with complex nested data', async () => {
    const input = `---
name: Test Document
description: A test document
metadata:
  author: John Doe
  tags: [typescript, markdown]
config:
  debug: true
  verbose: false
output-frontmatter:
  - name
  - description
  - metadata
---

# Content`

    const result = await processor.process({
      content: input,
      baseDir: __dirname,
      mode: 'build',
    })

    const parsed = matter(result.content)

    expect(parsed.data).toHaveProperty('name')
    expect(parsed.data).toHaveProperty('description')
    expect(parsed.data).toHaveProperty('metadata')
    expect(parsed.data.metadata).toEqual({
      author: 'John Doe',
      tags: ['typescript', 'markdown'],
    })
    expect(parsed.data).not.toHaveProperty('config')
  })
})
