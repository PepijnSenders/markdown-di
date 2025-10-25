# markdown-di

**Type-safe dependency injection for markdown using frontmatter.**

A parser-agnostic system for composing markdown documents with frontmatter-based dependency declarations, validation, and transclusion.

## Why?

When building large markdown documentation systems or content workflows, you often need to:
- **Reuse content** across multiple documents
- **Compose documents** from smaller, maintainable pieces
- **Validate references** at build time (not runtime)
- **Avoid duplication** while keeping sources DRY

Traditional approaches use template-level substitution which is error-prone and hard to validate. `markdown-di` introduces a **dependency injection pattern** where all transclusions must be declared in frontmatter before use.

## Key Features

- ✅ **Type-safe references** - All `{{refs}}` validated against frontmatter declarations
- ✅ **Schema validation** - Validate frontmatter structure with Zod schemas
- ✅ **Early validation** - Catch errors at parse time, not resolution time
- ✅ **Self-documenting** - Frontmatter shows all external dependencies at a glance
- ✅ **Parser-agnostic core** - Works with any markdown parser
- ✅ **Semantic syntax** - Use `{{workflows.key}}` instead of full paths
- ✅ **Glob support** - Expand wildcards for bulk inclusion
- ✅ **Named groups** - Organize dependencies for selective inclusion

## Architecture

```
markdown-di/
├── @markdown-di/core      # Parser-agnostic validation & DI system
├── @markdown-di/remark    # Remark/unified adapter (AST-based)
└── @markdown-di/cli       # Standalone CLI tool
```

## Quick Example

### Before (Error-prone)

```markdown
---
name: my-document
---

# My Document

{{some/path/to/file.md}}
{{another/file.md}}
```

**Problems:**
- ❌ Can't validate references until file resolution
- ❌ Hard to change paths (must find/replace in body)
- ❌ Not clear what dependencies exist
- ❌ Can't easily mock for testing

### After (Type-safe)

```markdown
---
name: my-document
description: My awesome document

# Declare all dependencies upfront
blueprints:
  sections:
    intro: docs/sections/intro.md
    conclusion: docs/sections/conclusion.md

references:
  guides:
    - docs/guides/*.md
---

# My Document

{{sections.intro}}

## Main Content

...

{{sections.conclusion}}

## Related Guides

{{references.guides}}
```

**Benefits:**
- ✅ All dependencies visible in frontmatter
- ✅ Early validation (parse time)
- ✅ Short, semantic references in body
- ✅ Easy to change paths (edit frontmatter only)
- ✅ Testable (mock by swapping frontmatter)

## Installation

```bash
# Core (parser-agnostic)
bun add @markdown-di/core

# Remark adapter (for AST-based transformations)
bun add @markdown-di/remark

# CLI tool
bun add -g @markdown-di/cli
```

## Usage

### With Core (Simple String Replacement)

```typescript
import { MarkdownDI } from '@markdown-di/core';

const mdi = new MarkdownDI();

const result = await mdi.process({
  content: myMarkdownString,
  baseDir: './docs'
});

// result.content - processed markdown
// result.errors - validation errors (if any)
```

### With Remark (Advanced AST Transformations)

```typescript
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import { remarkMarkdownDI } from '@markdown-di/remark';

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter)
  .use(remarkMarkdownDI, {
    baseDir: './docs',
    // Enable advanced transformations
    headingShift: true,
    linkRewrite: true
  })
  .use(remarkStringify);

const result = await processor.process(myMarkdownString);
```

### With CLI

```bash
# Build all markdown files
markdown-di build --input ./src --output ./dist

# Watch mode
markdown-di build --input ./src --output ./dist --watch

# Validate only (no output)
markdown-di validate ./src
```

## Frontmatter Schema

```yaml
---
# Required fields
name: document-name
description: Document description

# Optional: Blueprint dependencies (singular references)
blueprints:
  group-name:          # e.g., "sections", "templates"
    key: path/to/file.md

# Optional: Reference dependencies (can include globs)
references:
  group-name:          # e.g., "guides", "examples"
    - path/to/file.md
    - path/with/glob/*.md

# Optional: Schema validation
schema: schema-name    # Reference to registered schema
# OR inline schema definition:
schema:
  type: object
  properties:
    customField:
      type: string
  required:
    - customField
---

# Use in body:
{{blueprints.group-name.key}}    # Single file
{{references.group-name}}        # All files in group (concatenated)
```

## Schema Validation

Validate frontmatter structure using Zod schemas for type safety and consistency.

### Registering Schemas Programmatically

```typescript
import { MarkdownDI } from '@markdown-di/core';
import { z } from 'zod';

const mdi = new MarkdownDI();

// Define a schema for blog posts
const blogSchema = z.object({
  name: z.string(),
  description: z.string(),
  author: z.string(),
  publishDate: z.string(),
  tags: z.array(z.string()).optional(),
});

// Register the schema
mdi.registerSchema('blog', blogSchema);

// Documents can now reference this schema
const result = await mdi.process({
  content: `---
name: my-blog-post
description: A great post
schema: blog
author: Jane Doe
publishDate: 2025-01-15
tags:
  - typescript
  - markdown
---

# My Blog Post

Content here...
`,
  baseDir: './docs'
});
```

### Using Inline Schemas

```yaml
---
name: custom-document
description: Document with inline schema

# Inline YAML schema definition
schema:
  type: object
  properties:
    category:
      type: string
      enum: [tutorial, guide, reference]
    difficulty:
      type: string
      enum: [beginner, intermediate, advanced]
  required:
    - category
    - difficulty

# Custom validated fields
category: tutorial
difficulty: beginner
---
```

### CLI Schema Validation

```bash
# Validate with schema file
markdown-di validate ./docs --schema ./schema.js

# Build with schema validation
markdown-di build --input ./docs --output ./dist --schema ./schema.js
```

### Configuration File with Schemas

Create `markdown-di.config.js`:

```javascript
import { z } from 'zod';

export default {
  schemas: {
    blog: z.object({
      name: z.string(),
      description: z.string(),
      author: z.string(),
      publishDate: z.string(),
    }),
    api: z.object({
      name: z.string(),
      description: z.string(),
      version: z.string(),
      endpoint: z.string().url(),
    }),
  },
};
```

## Reference Syntax

### Valid Patterns
- `{{blueprints.group.key}}` - Nested blueprint reference (explicit)
- `{{group.key}}` - Shorthand (assumes blueprints)
- `{{references.group}}` - All files in reference group
- `{{references}}` - All reference groups concatenated

### Invalid Patterns (Build Errors)
- `{{path/to/file.md}}` - Direct path (not in frontmatter) ❌
- `{{undefined-thing}}` - Not declared in frontmatter ❌

## Development Status

🚧 **Alpha** - API is not stable, under active development

## Packages

| Package | Status | Description |
|---------|--------|-------------|
| [@markdown-di/core](./packages/core) | 🚧 Planning | Parser-agnostic validation & DI |
| [@markdown-di/remark](./packages/remark) | 🚧 Planning | Remark adapter with AST transforms |
| [@markdown-di/cli](./packages/cli) | 🚧 Planning | Standalone CLI tool |

## Roadmap

- [ ] Core validation system
- [ ] Basic string-replacement transclusion
- [ ] Remark adapter with AST transformations
- [ ] CLI tool
- [ ] Comprehensive documentation
- [ ] Examples and templates
- [ ] VS Code extension (syntax highlighting, validation)
- [ ] Future adapters: marked, markdown-it

## Contributing

Contributions welcome! This is an early-stage project, so expect APIs to change.

## License

MIT © Pepijn Senders

## Inspiration

This project was born from building composable markdown systems for agent-based development workflows. The pattern emerged from the need to manage ~150 markdown files with ~4,500 lines of duplication in a maintainable, type-safe way.

Read more about the research and architecture: [RESEARCH.md](./RESEARCH.md)
