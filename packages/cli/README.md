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
   * Hook called before compilation to inject variables into frontmatter
   * @param context - Hook context with file ID, path, frontmatter, baseDir, and dynamicFields
   * @param context.dynamicFields - Array of field names marked as $dynamic in frontmatter
   * @returns Object to be deep merged into frontmatter (must include all $dynamic fields)
   */
  onBeforeCompile?: (context: HookContext) => Promise<Record<string, unknown>> | Record<string, unknown>;

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

## Variable Injection with `onBeforeCompile` Hook

Inject dynamic variables into frontmatter before compilation using the `onBeforeCompile` hook. This enables "templates of templates" functionality.

### Dynamic Variables with `$dynamic`

Mark fields as `$dynamic` in frontmatter to declare that they **must** be provided by the hook. The build will fail if the hook doesn't provide all declared dynamic fields:

```typescript
import type { MarkdownDIConfig } from '@markdown-di/cli';
import { z } from 'zod';

const blogPostSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  title: z.string(),
  author: z.string(),
  publishedAt: z.string().datetime(),
  status: z.enum(['draft', 'published', 'archived'])
});

export default {
  baseDir: './blog',
  schemas: {
    'blog-post': blogPostSchema
  },
  onBeforeCompile: async (context) => {
    // context.id = "blog.posts.intro" (auto-generated from path)
    // context.filePath = "/path/to/blog/posts/intro.md"
    // context.dynamicFields = ["author", "publishedAt"] (fields marked as $dynamic)

    // MUST provide all dynamic fields or build fails
    return {
      author: await fetchAuthor(context.id),
      publishedAt: new Date().toISOString(),
    };
  }
} satisfies MarkdownDIConfig;
```

**Markdown file with `$dynamic` fields:**
```markdown
---
schema: blog-post
name: Getting Started
title: My First Post
author: $dynamic
publishedAt: $dynamic
status: published
---

# {{title}}

By {{author}} on {{publishedAt}}

Status: {{status}}
```

**Key features:**
- **`$dynamic` declaration**: Explicitly mark fields that need hook injection
- **Build-time validation**: Fails if hook doesn't provide all `$dynamic` fields
- **Static override**: Replace `$dynamic` with a real value to skip hook for that field
- **File ID**: Auto-generated from path (`docs/intro.md` → `docs.intro`)
- **Execution timing**: Runs before schema validation
- **Deep merge**: Hook results are deep-merged with existing frontmatter
- **Schema validation**: Merged frontmatter is validated against schema after injection

**Error handling:**

If the hook doesn't provide a `$dynamic` field, the build fails:
```
✗ Found 1 error in blog/post.md:
  schema: Hook must provide these $dynamic fields: publishedAt at onBeforeCompile
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
