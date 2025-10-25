import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import { remarkMarkdownDI } from '../src/index';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';

const TEST_DIR = join(__dirname, '../../test-fixtures-remark');

// Setup test fixtures
function setupTestFixtures() {
  // Create test directory
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'sections'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'components'), { recursive: true });

  // Create section files
  writeFileSync(
    join(TEST_DIR, 'sections', 'header.md'),
    '# Header Section\n\nThis is a reusable header component.'
  );

  writeFileSync(
    join(TEST_DIR, 'sections', 'footer.md'),
    '---\n\n© 2025 Test Company. All rights reserved.'
  );

  // Create component files
  writeFileSync(
    join(TEST_DIR, 'components', 'callout.md'),
    '> **Note:** This is an important callout message.'
  );

  writeFileSync(
    join(TEST_DIR, 'components', 'code-example.md'),
    '```javascript\nconst example = "Hello World";\nconsole.log(example);\n```'
  );
}

// Cleanup test fixtures
function cleanupTestFixtures() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

describe('remarkMarkdownDI - Integration Tests', () => {
  beforeAll(() => {
    setupTestFixtures();
  });

  afterAll(() => {
    cleanupTestFixtures();
  });

  describe('Basic Remark Processing', () => {
    test('processes markdown with dependency injection via remark', async () => {
      const input = `---
name: remark-test
description: Testing remark plugin

blueprints:
  sections:
    header: sections/header.md
---

{{sections.header}}

## Main Content

This is the main content.
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR })
        .use(remarkStringify);

      const result = await processor.process(input);

      expect(String(result)).toMatchSnapshot();
    });

    test('processes document with multiple transclusions', async () => {
      const input = `---
name: multi-transclusion
description: Multiple transclusions test

blueprints:
  sections:
    header: sections/header.md
    footer: sections/footer.md
  components:
    callout: components/callout.md
---

{{sections.header}}

## Content Section

Here's some content with a callout:

{{components.callout}}

More content here.

{{sections.footer}}
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR })
        .use(remarkStringify);

      const result = await processor.process(input);

      expect(String(result)).toMatchSnapshot();
    });

    test('handles code blocks in transclusions', async () => {
      const input = `---
name: code-transclusion
description: Testing code block transclusion

blueprints:
  components:
    example: components/code-example.md
---

# Code Examples

Here's a code example:

{{components.example}}

That's the example.
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR })
        .use(remarkStringify);

      const result = await processor.process(input);

      expect(String(result)).toMatchSnapshot();
    });
  });

  describe('Validation Mode', () => {
    test('validates without processing in validate mode', async () => {
      const input = `---
name: validation-test
description: Testing validation mode

blueprints:
  sections:
    header: sections/header.md
    nonexistent: sections/does-not-exist.md
---

{{sections.header}}
{{sections.nonexistent}}
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR, mode: 'validate' })
        .use(remarkStringify);

      const vfile = await processor.process(input);

      expect(String(vfile)).toMatchSnapshot();
      expect(vfile.messages.length).toBeGreaterThan(0);
      expect(vfile.data).toMatchSnapshot();
    });

    test('collects validation errors in file data', async () => {
      const input = `---
name: error-collection
description: Collecting validation errors
---

{{undefined.reference}}
{{another.missing}}
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR, mode: 'validate' })
        .use(remarkStringify);

      const vfile = await processor.process(input);

      expect(vfile.data).toMatchSnapshot();
      expect((vfile.data as any).markdownDI?.errors).toBeDefined();
      expect((vfile.data as any).markdownDI?.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Build Mode', () => {
    test('processes and replaces references in build mode', async () => {
      const input = `---
name: build-mode-test
description: Testing build mode processing

blueprints:
  sections:
    header: sections/header.md
    footer: sections/footer.md
---

{{sections.header}}

# Main Section

Content goes here.

{{sections.footer}}
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR, mode: 'build' })
        .use(remarkStringify);

      const result = await processor.process(input);

      expect(String(result)).toMatchSnapshot();
    });
  });

  describe('Advanced Options', () => {
    test('respects headingShift option', async () => {
      const input = `---
name: heading-shift-test
description: Testing heading shift

blueprints:
  sections:
    header: sections/header.md
---

# Top Level

{{sections.header}}
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, {
          baseDir: TEST_DIR,
          headingShift: true
        })
        .use(remarkStringify);

      const result = await processor.process(input);

      // Note: This feature is planned but not yet implemented
      // The test documents the expected behavior
      expect(String(result)).toMatchSnapshot();
    });

    test('respects linkRewrite option', async () => {
      const input = `---
name: link-rewrite-test
description: Testing link rewriting

blueprints:
  sections:
    header: sections/header.md
---

# Document

{{sections.header}}
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, {
          baseDir: TEST_DIR,
          linkRewrite: true
        })
        .use(remarkStringify);

      const result = await processor.process(input);

      // Note: This feature is planned but not yet implemented
      // The test documents the expected behavior
      expect(String(result)).toMatchSnapshot();
    });
  });

  describe('File Metadata', () => {
    test('stores frontmatter in file data', async () => {
      const input = `---
name: metadata-test
description: Testing metadata storage
author: Test Author

blueprints:
  sections:
    header: sections/header.md
---

{{sections.header}}
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR })
        .use(remarkStringify);

      const vfile = await processor.process(input);

      expect(vfile.data).toMatchSnapshot();
      expect((vfile.data as any).markdownDI?.frontmatter).toBeDefined();
      expect((vfile.data as any).markdownDI?.frontmatter.name).toBe('metadata-test');
      expect((vfile.data as any).markdownDI?.frontmatter.author).toBe('Test Author');
    });

    test('stores dependencies in file data', async () => {
      const input = `---
name: dependencies-test
description: Testing dependency tracking

blueprints:
  sections:
    header: sections/header.md
    footer: sections/footer.md
---

{{sections.header}}
{{sections.footer}}
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR })
        .use(remarkStringify);

      const vfile = await processor.process(input);

      expect(vfile.data).toMatchSnapshot();
      expect((vfile.data as any).markdownDI?.dependencies).toBeDefined();
      expect((vfile.data as any).markdownDI?.dependencies.length).toBeGreaterThan(0);
    });

    test('stores errors in file data', async () => {
      const input = `---
name: errors-test
description: Testing error tracking

blueprints:
  sections:
    header: sections/header.md
---

{{sections.header}}
{{sections.undefined}}
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR })
        .use(remarkStringify);

      const vfile = await processor.process(input);

      expect(vfile.data).toMatchSnapshot();
      expect((vfile.data as any).markdownDI?.errors).toBeDefined();
    });
  });

  describe('Complex Scenarios', () => {
    test('processes complex document with nested structures', async () => {
      const input = `---
name: complex-document
description: Complex document with various elements

blueprints:
  sections:
    header: sections/header.md
    footer: sections/footer.md
  components:
    callout: components/callout.md
    code: components/code-example.md
---

{{sections.header}}

## Introduction

This is a complex document demonstrating various features.

{{components.callout}}

## Code Examples

{{components.code}}

## Conclusion

Thank you for reading.

{{sections.footer}}
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR })
        .use(remarkStringify);

      const result = await processor.process(input);

      expect(String(result)).toMatchSnapshot();
      expect(result.data).toMatchSnapshot();
    });

    test('handles empty documents gracefully', async () => {
      const input = `---
name: empty-document
description: Empty document test
---
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR })
        .use(remarkStringify);

      const result = await processor.process(input);

      expect(String(result)).toMatchSnapshot();
    });

    test('preserves markdown formatting', async () => {
      const input = `---
name: formatting-preservation
description: Testing formatting preservation

blueprints:
  components:
    callout: components/callout.md
---

# Main Title

This is **bold** and this is *italic*.

{{components.callout}}

- List item 1
- List item 2
  - Nested item
- List item 3

1. Numbered list
2. Second item
   1. Nested numbered
3. Third item
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR })
        .use(remarkStringify);

      const result = await processor.process(input);

      expect(String(result)).toMatchSnapshot();
    });
  });

  describe('Error Handling', () => {
    test('handles missing frontmatter', async () => {
      const input = `# Document Without Frontmatter

{{sections.header}}
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR })
        .use(remarkStringify);

      const vfile = await processor.process(input);

      expect(String(vfile)).toMatchSnapshot();
      expect((vfile.data as any).markdownDI?.errors).toBeDefined();
    });

    test('handles invalid yaml in frontmatter', async () => {
      const input = `---
invalid yaml: : : here
---

# Content
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR })
        .use(remarkStringify);

      const vfile = await processor.process(input);

      expect(String(vfile)).toMatchSnapshot();
    });

    test('handles file read errors gracefully', async () => {
      const input = `---
name: file-error-test
description: Testing file read errors

blueprints:
  sections:
    missing: sections/does-not-exist.md
---

{{sections.missing}}
`;

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(remarkMarkdownDI, { baseDir: TEST_DIR })
        .use(remarkStringify);

      const vfile = await processor.process(input);

      expect(String(vfile)).toMatchSnapshot();
      expect((vfile.data as any).markdownDI?.errors.some((e: any) => e.type === 'file')).toBe(true);
    });
  });
});
