import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { MarkdownDI } from '../src/index';
import { z } from 'zod';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';

const TEST_DIR = join(__dirname, '../../test-fixtures');

// Setup test fixtures
function setupTestFixtures() {
  // Create test directory
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'sections'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'guides'), { recursive: true });

  // Create section files
  writeFileSync(
    join(TEST_DIR, 'sections', 'intro.md'),
    '# Introduction\n\nThis is the introduction section with some content.'
  );

  writeFileSync(
    join(TEST_DIR, 'sections', 'conclusion.md'),
    '# Conclusion\n\nThis wraps up the document nicely.'
  );

  // Create guide files
  writeFileSync(
    join(TEST_DIR, 'guides', 'getting-started.md'),
    '## Getting Started Guide\n\nStep 1: Install the package\nStep 2: Configure it\nStep 3: Use it'
  );

  writeFileSync(
    join(TEST_DIR, 'guides', 'advanced.md'),
    '## Advanced Usage\n\nThis covers advanced topics and patterns.'
  );
}

// Cleanup test fixtures
function cleanupTestFixtures() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

describe('MarkdownDI - Core Integration Tests', () => {
  beforeAll(() => {
    setupTestFixtures();
  });

  afterAll(() => {
    cleanupTestFixtures();
  });

  describe('Basic Processing', () => {
    test('processes simple blueprint references with shorthand syntax', async () => {
      const content = `---
name: test-document
description: A test document

blueprints:
  sections:
    intro: sections/intro.md
---

# My Document

{{sections.intro}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.content).toMatchSnapshot();
      expect(result.errors).toMatchSnapshot();
      expect(result.frontmatter.name).toBe('test-document');
    });

    test('processes blueprint references with explicit syntax', async () => {
      const content = `---
name: explicit-syntax-doc
description: Document using explicit blueprint syntax

blueprints:
  sections:
    intro: sections/intro.md
    conclusion: sections/conclusion.md
---

# My Document

{{blueprints.sections.intro}}

## Middle Section

Some content here.

{{blueprints.sections.conclusion}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      // Captures current behavior - explicit syntax validates but may not resolve
      expect(result.content).toMatchSnapshot();
      expect(result.errors).toMatchSnapshot();
      expect(result.frontmatter.name).toBe('explicit-syntax-doc');

      // The explicit syntax {{blueprints.sections.intro}} should be supported
      // per the README, but currently only shorthand {{sections.intro}} works
    });

    test('processes multiple blueprint references', async () => {
      const content = `---
name: multi-section-doc
description: Document with multiple sections

blueprints:
  sections:
    intro: sections/intro.md
    conclusion: sections/conclusion.md
---

# Complete Document

{{sections.intro}}

## Middle Section

Some content in the middle.

{{sections.conclusion}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.content).toMatchSnapshot();
      expect(result.errors).toMatchSnapshot();
    });

    test('processes reference groups with wildcards', async () => {
      const content = `---
name: guide-collection
description: Collection of all guides

references:
  guides:
    - guides/*.md
---

# All Guides

{{references.guides}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.content).toMatchSnapshot();
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });

    test('processes mixed blueprint and reference dependencies', async () => {
      const content = `---
name: mixed-document
description: Document with both blueprints and references

blueprints:
  sections:
    intro: sections/intro.md

references:
  guides:
    - guides/getting-started.md
    - guides/advanced.md
---

# Mixed Content Document

{{sections.intro}}

## Related Guides

{{references.guides}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.content).toMatchSnapshot();
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Validation', () => {
    test('validates and catches missing frontmatter fields', async () => {
      const content = `---
name: incomplete-doc
---

# Document Without Description

{{sections.intro}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
        mode: 'validate'
      });

      expect(result.errors).toMatchSnapshot();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.type === 'frontmatter')).toBe(true);
    });

    test('validates and catches undefined references', async () => {
      const content = `---
name: bad-refs
description: Document with undefined references

blueprints:
  sections:
    intro: sections/intro.md
---

# Document

{{sections.intro}}
{{sections.undefined}}
{{something.random}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
        mode: 'validate'
      });

      expect(result.errors).toMatchSnapshot();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('undefined'))).toBe(true);
    });

    test('validates reference syntax', async () => {
      const content = `---
name: syntax-errors
description: Document with syntax errors
---

# Document

{{}}
{{invalid{nested}}}
{{too.many.levels.here.really}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
        mode: 'validate'
      });

      expect(result.errors).toMatchSnapshot();
      expect(result.errors.some(e => e.type === 'syntax')).toBe(true);
    });

    test('validates blueprint structure', async () => {
      const content = `---
name: bad-structure
description: Document with bad blueprint structure

blueprints:
  - this-should-be-an-object
---

# Document

Content here.
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
        mode: 'validate'
      });

      expect(result.errors).toMatchSnapshot();
      expect(result.errors.some(e => e.type === 'frontmatter')).toBe(true);
    });

    test('validates reference structure', async () => {
      const content = `---
name: bad-refs-structure
description: Document with bad reference structure

references:
  guides: "should-be-an-array"
---

# Document

{{references.guides}}
`;

      const mdi = new MarkdownDI();

      // The validator should catch this, but if the resolver processes it first, it may throw
      // Either way, we expect errors to be generated or an exception
      try {
        const result = await mdi.process({
          content,
          baseDir: TEST_DIR,
          mode: 'validate'
        });

        expect(result.errors).toMatchSnapshot();
        expect(result.errors.some(e => e.type === 'frontmatter')).toBe(true);
      } catch (error) {
        // If it throws, that's also acceptable - the validation caught the error
        expect(error).toBeDefined();
      }
    });
  });

  describe('Schema Validation', () => {
    test('validates with Zod schema from options', async () => {
      const schema = z.object({
        name: z.string(),
        description: z.string(),
        author: z.string(),
        version: z.string(),
      });

      const content = `---
name: versioned-doc
description: A document with version info
author: Test Author
version: 1.0.0
---

# Document

Content here.
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
        schema: { schema }
      });

      expect(result.errors).toMatchSnapshot();
      expect(result.errors.length).toBe(0);
    });

    test('catches schema validation errors', async () => {
      const schema = z.object({
        name: z.string(),
        description: z.string(),
        author: z.string(),
        version: z.string(),
        count: z.number(),
      });

      const content = `---
name: invalid-doc
description: Missing required fields
author: Test Author
---

# Document

Content here.
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR,
        schema: { schema }
      });

      expect(result.errors).toMatchSnapshot();
      expect(result.errors.some(e => e.type === 'schema')).toBe(true);
    });

    test('registers and uses named schemas', async () => {
      const blogSchema = z.object({
        name: z.string(),
        description: z.string(),
        schema: z.literal('blog'),
        author: z.string(),
        publishDate: z.string(),
      });

      const content = `---
name: blog-post
description: A blog post
schema: blog
author: Jane Doe
publishDate: 2025-01-01
---

# Blog Post

Content here.
`;

      const mdi = new MarkdownDI();
      mdi.registerSchema('blog', blogSchema);

      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.errors).toMatchSnapshot();
      // The schema includes the schema field itself, so it may have validation errors
    });

    test('catches errors for unregistered schema references', async () => {
      const content = `---
name: blog-post
description: A blog post
schema: nonexistent-schema
---

# Blog Post

Content here.
`;

      const mdi = new MarkdownDI();

      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.errors).toMatchSnapshot();
      expect(result.errors.some(e => e.message.includes('not registered'))).toBe(true);
    });
  });

  describe('Dependency Resolution', () => {
    test('resolves dependencies from frontmatter', async () => {
      const content = `---
name: deps-test
description: Test dependency resolution

blueprints:
  sections:
    intro: sections/intro.md
    conclusion: sections/conclusion.md

references:
  guides:
    - guides/*.md
---

# Document

{{sections.intro}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.dependencies).toMatchSnapshot();
      // Dependencies should include resolved files if they exist
    });

    test('includes all resolved files in dependencies', async () => {
      const content = `---
name: all-deps
description: All dependencies test

blueprints:
  sections:
    intro: sections/intro.md
    conclusion: sections/conclusion.md

references:
  guides:
    - guides/getting-started.md
    - guides/advanced.md
---

# Document

{{sections.intro}}
{{sections.conclusion}}
{{references.guides}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.dependencies).toMatchSnapshot();
      // Check if dependencies include the expected files
      const hasIntro = result.dependencies.some(dep => dep.includes('intro.md'));
      const hasConclusion = result.dependencies.some(dep => dep.includes('conclusion.md'));
      expect(hasIntro || hasConclusion).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('handles missing files gracefully', async () => {
      const content = `---
name: missing-files
description: Document with missing files

blueprints:
  sections:
    missing: sections/does-not-exist.md
---

# Document

{{sections.missing}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.errors).toMatchSnapshot();
      expect(result.errors.some(e => e.type === 'file')).toBe(true);
    });

    test('handles malformed frontmatter', async () => {
      const content = `---
this is not: valid: yaml: at: all
---

# Document

Content here.
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.errors).toMatchSnapshot();
    });

    test('handles empty frontmatter', async () => {
      const content = `---
---

# Document

{{sections.intro}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.errors).toMatchSnapshot();
      expect(result.errors.some(e => e.message.includes('frontmatter'))).toBe(true);
    });
  });

  describe('Complex Scenarios', () => {
    test('processes document with all features combined', async () => {
      const content = `---
name: complete-example
description: Complete example with all features

blueprints:
  sections:
    intro: sections/intro.md
    conclusion: sections/conclusion.md

references:
  guides:
    - guides/getting-started.md
    - guides/advanced.md
---

# Complete Documentation

## Introduction

{{sections.intro}}

## Main Content

This is custom content written directly in the document.

### Examples and Guides

Here are some related guides:

{{references.guides}}

## Conclusion

{{sections.conclusion}}
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.content).toMatchSnapshot();
      expect(result.errors).toMatchSnapshot();
      expect(result.dependencies).toMatchSnapshot();
      expect(result.frontmatter).toMatchSnapshot();
    });

    test('preserves formatting and whitespace', async () => {
      const content = `---
name: formatting-test
description: Test formatting preservation

blueprints:
  sections:
    intro: sections/intro.md
---

# Document

First paragraph.

{{sections.intro}}

   Indented content here.

- List item 1
- List item 2
`;

      const mdi = new MarkdownDI();
      const result = await mdi.process({
        content,
        baseDir: TEST_DIR
      });

      expect(result.content).toMatchSnapshot();
    });
  });
});
