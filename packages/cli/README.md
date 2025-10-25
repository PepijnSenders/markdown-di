# @markdown-di/cli

Format markdown files with frontmatter dependency injection and TypeScript schema validation.

## Installation

```bash
# Local installation (recommended)
bun add -D @markdown-di/cli

# Or use with bunx (no install needed)
bunx @markdown-di/cli
```

## Usage

Create a `markdown-di.config.ts` file in your project root:

```typescript
import { z } from 'zod';
import type { MarkdownDIConfig } from '@markdown-di/cli';

// Define your schemas
const documentSchema = z.object({
  name: z.string(),
  description: z.string(),
  partials: z.record(z.string()).optional()
});

const blogPostSchema = z.object({
  name: z.string(),
  title: z.string(),
  author: z.string(),
  date: z.string(),
  partials: z.record(z.string()).optional()
});

export default {
  baseDir: './docs',
  include: ['**/*.md'],
  exclude: ['node_modules/**', '.git/**'],
  schemas: {
    'document': documentSchema,
    'blog-post': blogPostSchema
  }
} satisfies MarkdownDIConfig;
```

Then run the CLI:

```bash
# Format all markdown files
markdown-di

# Or with bunx
bunx @markdown-di/cli
```

## Configuration

The `markdown-di.config.ts` file accepts the following options:

```typescript
interface MarkdownDIConfig {
  /**
   * Base directory containing markdown files to format
   * @default process.cwd()
   */
  baseDir?: string;

  /**
   * Glob patterns to match markdown files
   * @default ['**/*.md']
   */
  include?: string[];

  /**
   * Glob patterns to exclude
   * @default ['node_modules/**', '.git/**']
   */
  exclude?: string[];

  /**
   * Registered schemas for frontmatter validation
   * Key is the schema name (matches frontmatter.name field)
   * These are registered using mdi.registerSchemas() internally
   */
  schemas?: Record<string, ZodSchema>;

  /**
   * Check mode - exits with error if files would change
   * @default false
   */
  check?: boolean;
}
```

## How It Works

Markdown files with frontmatter define dependencies using the `partials` key:

**`docs/guide.md`:**
```markdown
---
name: document
description: User guide

partials:
  intro: sections/intro.md
  features: sections/features.md
---

# User Guide

{{partials.intro}}

## Features

{{partials.features}}
```

The `{{partials.intro}}` syntax gets replaced with the contents of `sections/intro.md` relative to the base directory.

## Schema Validation

Schemas are registered in the config file. The CLI validates frontmatter against the schema that matches the `name` field:

```typescript
// In markdown-di.config.ts
schemas: {
  'document': documentSchema,  // Validates files with name: document
  'blog-post': blogPostSchema   // Validates files with name: blog-post
}
```

## CI/CD Integration

Set `check: true` in your config or use an environment variable:

```bash
# In CI - check without modifying files
CHECK=true markdown-di
```

Update your config to read the environment:

```typescript
export default {
  baseDir: './docs',
  check: process.env.CHECK === 'true',
  schemas: { /* ... */ }
} satisfies MarkdownDIConfig;
```

## Exit Codes

- `0` - Success (all files formatted or already formatted)
- `1` - Errors found or files would be changed (in check mode)

## License

MIT © Pepijn Senders
