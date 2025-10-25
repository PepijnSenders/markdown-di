# markdown-di

**Type-safe Mustache templating for markdown with Zod schema validation.**

Build reliable documentation and content systems with frontmatter schemas that catch errors at build time.

## The Problem

Frontmatter errors surface too late or never get caught:

```markdown
---
publishedAt: 2024-13-45   ❌ Invalid date
tags: "tutorial"          ❌ Should be array
authenticated: "yes"      ❌ Should be boolean
---
```

## The Solution

**Define schemas once**, validate all documents at build time:

```typescript
import { MarkdownDI, z } from '@markdown-di/core';

const mdi = new MarkdownDI();

mdi.registerSchema('blog-post', z.object({
  author: z.string(),
  publishedAt: z.string().datetime(),
  tags: z.array(z.string())
}));
```

**Write documents** with validated frontmatter + Mustache templating:

```markdown
---
schema: blog-post
name: Getting Started
author: Jane Doe
publishedAt: 2024-01-15T10:00:00Z
tags: [tutorial, beginners]

partials:
  footer: common/footer.md
---

# {{name}}

By {{author}}

{{#tags}}
- {{.}}
{{/tags}}

{{partials.footer}}
```

**Get build-time errors** with exact locations:

```typescript
const result = await mdi.process({
  content: markdownContent,
  baseDir: './docs'
});

// Result contains validation errors:
// [schema] Invalid datetime string at publishedAt
// [schema] Expected array, received string at tags
```

## Features

- ✅ **Zod schema validation** - Type-safe frontmatter at build time
- ✅ **Mustache templating** - Variables, loops, conditionals
- ✅ **File injection** - Include external files with `{{partials.xxx}}`
- ✅ **Glob patterns** - `guides/*.md` expands to multiple files
- ✅ **Security** - Path traversal protection, circular dependency detection
- ✅ **Dynamic injection** - `onBeforeCompile` hook for runtime variable injection

## Installation

```bash
npm install @markdown-di/core
```

## Quick Start

```typescript
import { MarkdownDI, z } from '@markdown-di/core';
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

// Initialize and register schemas
const mdi = new MarkdownDI();

mdi.registerSchema('blog-post', z.object({
  author: z.string(),
  publishedAt: z.string().datetime(),
  tags: z.array(z.string())
}));

// Process all markdown files
const files = glob.sync('**/*.md', { ignore: 'node_modules/**' });

for (const file of files) {
  const content = readFileSync(file, 'utf-8');

  const result = await mdi.process({
    content,
    baseDir: './docs',
    currentFile: file
  });

  if (result.errors.length > 0) {
    console.error(`Errors in ${file}:`, result.errors);
    process.exit(1);
  }

  writeFileSync(file, result.content);
}
```

## Use Cases

- **Documentation sites** - Validate 100s of markdown files in CI/CD
- **Content workflows** - Enforce consistent frontmatter across teams
- **AI/Agent systems** - Validate generated markdown at build time
- **API docs** - Type-safe schemas for endpoints, methods, auth
- **Static site generators** - Pre-process markdown with type safety

## Documentation

See the [**Core API Documentation**](./packages/core) for:
- Complete API reference
- Schema validation
- Mustache templating
- File injection (partials)
- Security features
- Error handling
- TypeScript types

## License

MIT © Pepijn Senders
