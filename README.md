# markdown-di

**Type-safe Mustache templating for markdown with Zod schema validation.**

Build reliable documentation and content systems with frontmatter schemas that catch errors at build time.

## The Problem

Frontmatter errors surface too late or never get caught:

```markdown
---
publishedAt: 2024-13-45  ❌ Invalid date
tags: "tutorial"          ❌ Should be array
authenticated: "yes"      ❌ Should be boolean
---
```

## The Solution

**Define schemas once**, validate all documents at build time:

```typescript
// markdown-di.config.ts
import { z } from 'zod';

export default {
  schemas: {
    'blog-post': z.object({
      author: z.string(),
      publishedAt: z.string().datetime(),
      tags: z.array(z.string())
    })
  }
};
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

```
[schema] Invalid datetime string at publishedAt
[schema] Expected array, received string at tags
```

## Features

- ✅ **Zod schema validation** - Type-safe frontmatter at build time
- ✅ **Mustache templating** - Variables, loops, conditionals
- ✅ **File injection** - Include external files with `{{partials.xxx}}`
- ✅ **Glob patterns** - `guides/*.md` expands to multiple files
- ✅ **Security** - Path traversal protection, circular dependency detection

## Installation

```bash
bun add -D @markdown-di/cli        # CLI tool (recommended)
bun add @markdown-di/core          # Or programmatic API
```

## Quick Start

```bash
# Create config with schemas
cat > markdown-di.config.ts << 'EOF'
import { z } from 'zod';
export default {
  schemas: {
    'blog-post': z.object({
      author: z.string(),
      tags: z.array(z.string())
    })
  }
};
EOF

# Format and validate all markdown files
markdown-di

# CI/CD mode (fails on validation errors)
CHECK=true markdown-di
```

## Use Cases

- **Documentation sites** - Validate 100s of markdown files in CI/CD
- **Content workflows** - Enforce consistent frontmatter across teams
- **AI/Agent systems** - Validate generated markdown at build time
- **API docs** - Type-safe schemas for endpoints, methods, auth

## Documentation

- [**Core API**](./packages/core) - Programmatic usage, schema registration, validation
- [**CLI**](./packages/cli) - Configuration, usage, CI/CD integration

## License

MIT © Pepijn Senders
