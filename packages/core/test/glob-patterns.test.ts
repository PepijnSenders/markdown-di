import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { MarkdownDI } from '../src/index';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = './test-glob-fixtures';

describe('Glob Pattern Support', () => {
  beforeAll(() => {
    // Create test directory structure
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'guides'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'sections'), { recursive: true });

    // Create guide files
    writeFileSync(
      join(TEST_DIR, 'guides', 'getting-started.md'),
      '## Getting Started\n\nThis is the getting started guide.'
    );
    writeFileSync(
      join(TEST_DIR, 'guides', 'advanced.md'),
      '## Advanced Topics\n\nThis covers advanced usage.'
    );
    writeFileSync(
      join(TEST_DIR, 'guides', 'faq.md'),
      '## FAQ\n\nFrequently asked questions.'
    );

    // Create section files
    writeFileSync(
      join(TEST_DIR, 'sections', 'intro.md'),
      '# Introduction\n\nWelcome to the docs.'
    );
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test('should support single glob pattern (no array)', async () => {
    const content = `---
title: All Guides
partials:
  guides: guides/*.md
---

# {{title}}

{{partials.guides}}
`;

    const mdi = new MarkdownDI();
    const result = await mdi.process({
      content,
      baseDir: TEST_DIR,
    });

    expect(result.errors).toMatchSnapshot();
    expect(result.content).toMatchSnapshot();
  });

  test('should support array of glob patterns', async () => {
    const content = `---
title: Documentation
partials:
  allDocs:
    - sections/*.md
    - guides/*.md
---

# {{title}}

{{partials.allDocs}}
`;

    const mdi = new MarkdownDI();
    const result = await mdi.process({
      content,
      baseDir: TEST_DIR,
    });

    expect(result.errors).toMatchSnapshot();
    expect(result.content).toMatchSnapshot();
  });

  test('should support single file path (no glob)', async () => {
    const content = `---
title: Intro Only
partials:
  intro: sections/intro.md
---

# {{title}}

{{partials.intro}}
`;

    const mdi = new MarkdownDI();
    const result = await mdi.process({
      content,
      baseDir: TEST_DIR,
    });

    expect(result.errors).toMatchSnapshot();
    expect(result.content).toMatchSnapshot();
  });

  test('should support mixed single files and globs in array', async () => {
    const content = `---
title: Mixed Content
partials:
  content:
    - sections/intro.md
    - guides/getting-started.md
    - guides/a*.md
---

# {{title}}

{{partials.content}}
`;

    const mdi = new MarkdownDI();
    const result = await mdi.process({
      content,
      baseDir: TEST_DIR,
    });

    expect(result.errors).toMatchSnapshot();
    expect(result.content).toMatchSnapshot();
  });

  test('should handle multiple partials with different patterns', async () => {
    const content = `---
title: Multiple Partials
partials:
  intro: sections/intro.md
  guides: guides/*.md
---

# {{title}}

{{partials.intro}}

---

{{partials.guides}}
`;

    const mdi = new MarkdownDI();
    const result = await mdi.process({
      content,
      baseDir: TEST_DIR,
    });

    expect(result.errors).toMatchSnapshot();
    expect(result.content).toMatchSnapshot();
  });
});
