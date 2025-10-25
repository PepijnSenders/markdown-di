import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MarkdownDI } from '../src/index'

const TEST_DIR = join(__dirname, '../../test-fixtures-partials')

// Setup test fixtures
function setupTestFixtures() {
  // Create test directory
  mkdirSync(TEST_DIR, { recursive: true })
  mkdirSync(join(TEST_DIR, 'partials'), { recursive: true })
  mkdirSync(join(TEST_DIR, 'nested'), { recursive: true })

  // Create a simple partial without frontmatter (backward compatibility)
  writeFileSync(
    join(TEST_DIR, 'partials', 'simple.md'),
    'This is a simple partial without frontmatter.',
  )

  // Create a partial with frontmatter that uses parent variables
  writeFileSync(
    join(TEST_DIR, 'partials', 'with-parent-vars.md'),
    `---
name: Partial Title
description: A partial with variables
---

# {{name}}

Author: {{author}}
Theme: {{theme}}`,
  )

  // Create a partial with frontmatter that overrides parent variables
  writeFileSync(
    join(TEST_DIR, 'partials', 'override.md'),
    `---
name: Override Title
author: Partial Author
description: Overrides parent author
---

# {{name}}

By {{author}}`,
  )

  // Create a partial with $parent reference (same key)
  writeFileSync(
    join(TEST_DIR, 'partials', 'parent-same-key.md'),
    `---
name: Partial Name
author: $parent
theme: $parent
description: Uses parent author and theme
---

# {{name}}

Author: {{author}}
Theme: {{theme}}`,
  )

  // Create a partial with $parent('key') reference (different key)
  writeFileSync(
    join(TEST_DIR, 'partials', 'parent-diff-key.md'),
    `---
name: Partial Name
title: $parent('name')
authorName: $parent('author')
description: Maps parent keys to different names
---

# {{name}}

Title from parent: {{title}}
Author from parent: {{authorName}}`,
  )

  // Create nested partials
  writeFileSync(
    join(TEST_DIR, 'nested', 'level2.md'),
    `---
name: Level 2 Partial
level: 2
description: Second level partial
---

## {{name}} (Level {{level}})

Parent author: {{author}}
Parent theme: {{theme}}`,
  )

  writeFileSync(
    join(TEST_DIR, 'nested', 'level1.md'),
    `---
name: Level 1 Partial
level: 1
partials:
  level2: nested/level2.md
description: First level partial
---

# {{name}} (Level {{level}})

Author: {{author}}

{{partials.level2}}`,
  )

  // Create circular dependency test files
  writeFileSync(
    join(TEST_DIR, 'nested', 'circular-a.md'),
    `---
name: Circular A
partials:
  b: nested/circular-b.md
---

This is A
{{partials.b}}`,
  )

  writeFileSync(
    join(TEST_DIR, 'nested', 'circular-b.md'),
    `---
name: Circular B
partials:
  a: nested/circular-a.md
---

This is B
{{partials.a}}`,
  )
}

// Cleanup test fixtures
function cleanupTestFixtures() {
  rmSync(TEST_DIR, { recursive: true, force: true })
}

describe('Partials with Variables', () => {
  beforeAll(() => {
    setupTestFixtures()
  })

  afterAll(() => {
    cleanupTestFixtures()
  })

  describe('Backward Compatibility', () => {
    test('processes partials without frontmatter (old behavior)', async () => {
      const content = `---
name: Main Document
author: John Doe
partials:
  simple: partials/simple.md
---

# {{name}}

{{partials.simple}}
`

      const mdi = new MarkdownDI()
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
      })

      expect(result.errors.length).toBe(0)
      expect(result.content).toContain('This is a simple partial without frontmatter.')
    })
  })

  describe('Parent Variables in Partials', () => {
    test('partials can access parent frontmatter variables', async () => {
      const content = `---
name: Main Document
author: John Doe
theme: dark
partials:
  header: partials/with-parent-vars.md
---

{{partials.header}}
`

      const mdi = new MarkdownDI()
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
      })

      expect(result.errors.length).toBe(0)
      expect(result.content).toContain('Author: John Doe')
      expect(result.content).toContain('Theme: dark')
      expect(result.content).toContain('# Partial Title') // Partial's own name
    })

    test('partial variables override parent variables', async () => {
      const content = `---
name: Main Document
author: John Doe
partials:
  override: partials/override.md
---

# {{name}}

By {{author}}

{{partials.override}}
`

      const mdi = new MarkdownDI()
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
      })

      expect(result.errors.length).toBe(0)
      // Main document uses parent author
      expect(result.content).toMatch(/# Main Document\s+By John Doe/)
      // Partial uses its own author
      expect(result.content).toContain('# Override Title')
      expect(result.content).toContain('By Partial Author')
    })
  })

  describe('$parent Syntax', () => {
    test('$parent gets parent variable with same key', async () => {
      const content = `---
name: Main Document
author: John Doe
theme: dark
partials:
  header: partials/parent-same-key.md
---

{{partials.header}}
`

      const mdi = new MarkdownDI()
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
      })

      expect(result.errors.length).toBe(0)
      expect(result.content).toContain('# Partial Name') // Partial's own name
      expect(result.content).toContain('Author: John Doe') // From parent via $parent
      expect(result.content).toContain('Theme: dark') // From parent via $parent
    })

    test("$parent('key') gets parent variable with different key", async () => {
      const content = `---
name: Main Document
author: Jane Smith
partials:
  header: partials/parent-diff-key.md
---

{{partials.header}}
`

      const mdi = new MarkdownDI()
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
      })

      expect(result.errors.length).toBe(0)
      expect(result.content).toContain('# Partial Name')
      expect(result.content).toContain('Title from parent: Main Document')
      expect(result.content).toContain('Author from parent: Jane Smith')
    })

    test('$parent with missing parent key produces error', async () => {
      const partialContent = `---
name: Test
author: $parent
---

# {{name}}
By {{author}}`

      writeFileSync(join(TEST_DIR, 'partials', 'missing-parent.md'), partialContent)

      const content = `---
name: Main Document
partials:
  header: partials/missing-parent.md
---

{{partials.header}}
`

      const mdi = new MarkdownDI()
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
      })

      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some((e) => e.message.includes('does not have key "author"'))).toBe(
        true,
      )
    })

    test("$parent('key') with missing parent key produces error", async () => {
      const partialContent = `---
name: Test
title: $parent('nonexistent')
---

# {{title}}`

      writeFileSync(join(TEST_DIR, 'partials', 'missing-parent-key.md'), partialContent)

      const content = `---
name: Main Document
partials:
  header: partials/missing-parent-key.md
---

{{partials.header}}
`

      const mdi = new MarkdownDI()
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
      })

      expect(result.errors.length).toBeGreaterThan(0)
      expect(
        result.errors.some((e) => e.message.includes('does not have key "nonexistent"')),
      ).toBe(true)
    })
  })

  describe('Nested Partials', () => {
    test('supports nested partials (partials within partials)', async () => {
      const content = `---
name: Main Document
author: John Doe
theme: light
partials:
  level1: nested/level1.md
---

# {{name}}

{{partials.level1}}
`

      const mdi = new MarkdownDI()
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
      })

      expect(result.errors.length).toBe(0)
      expect(result.content).toContain('# Level 1 Partial (Level 1)')
      expect(result.content).toContain('## Level 2 Partial (Level 2)')
      expect(result.content).toContain('Parent author: John Doe')
      expect(result.content).toContain('Parent theme: light')
    })

    test('detects circular dependencies in nested partials', async () => {
      const content = `---
name: Main Document
partials:
  a: nested/circular-a.md
---

# {{name}}

{{partials.a}}
`

      const mdi = new MarkdownDI()
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
      })

      // Circular dependency should be detected
      // Note: The exact behavior depends on implementation
      // It may error, or handle gracefully
      expect(result.errors.length).toBeGreaterThan(0)
    })

    test('nested partials inherit parent context', async () => {
      const content = `---
name: Main Document
author: Alice
theme: dark
version: 1.0.0
partials:
  level1: nested/level1.md
---

{{partials.level1}}
`

      const mdi = new MarkdownDI()
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
      })

      expect(result.errors.length).toBe(0)
      // Level 2 should see the author and theme from main document
      expect(result.content).toContain('Parent author: Alice')
      expect(result.content).toContain('Parent theme: dark')
    })
  })

  describe('Complex Scenarios', () => {
    test('combines $parent, override, and nested partials', async () => {
      const level3Content = `---
name: Level 3
description: Third level
---

### {{name}}

Main author: {{author}}`

      const level2Content = `---
name: Level 2
author: $parent
partials:
  level3: nested/level3.md
description: Second level
---

## {{name}}

Author from parent: {{author}}

{{partials.level3}}`

      writeFileSync(join(TEST_DIR, 'nested', 'level3.md'), level3Content)
      writeFileSync(join(TEST_DIR, 'nested', 'complex-level2.md'), level2Content)

      const content = `---
name: Main Document
author: Original Author
partials:
  level2: nested/complex-level2.md
---

# {{name}}

{{partials.level2}}
`

      const mdi = new MarkdownDI()
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
      })

      expect(result.errors.length).toBe(0)
      expect(result.content).toContain('# Main Document')
      expect(result.content).toContain('## Level 2')
      expect(result.content).toContain('### Level 3')
      expect(result.content).toContain('Author from parent: Original Author')
      expect(result.content).toContain('Main author: Original Author')
    })

    test('partial with glob patterns and variables', async () => {
      // Create multiple files with frontmatter
      const guide1 = `---
name: Guide 1
difficulty: beginner
---

## {{name}}

Difficulty: {{difficulty}}`

      const guide2 = `---
name: Guide 2
difficulty: advanced
---

## {{name}}

Difficulty: {{difficulty}}`

      mkdirSync(join(TEST_DIR, 'guides'), { recursive: true })
      writeFileSync(join(TEST_DIR, 'guides', 'guide1.md'), guide1)
      writeFileSync(join(TEST_DIR, 'guides', 'guide2.md'), guide2)

      const content = `---
name: All Guides
author: Main Author
partials:
  guides: guides/*.md
---

# {{name}}

{{partials.guides}}
`

      const mdi = new MarkdownDI()
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
      })

      expect(result.errors.length).toBe(0)
      expect(result.content).toContain('## Guide 1')
      expect(result.content).toContain('Difficulty: beginner')
      expect(result.content).toContain('## Guide 2')
      expect(result.content).toContain('Difficulty: advanced')
    })
  })
})
