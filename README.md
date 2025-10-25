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
import { BatchProcessor, z } from '@markdown-di/core';

const processor = new BatchProcessor({
  baseDir: './docs',
  schemas: {
    'blog-post': z.object({
      author: z.string(),
      publishedAt: z.string().datetime(),
      tags: z.array(z.string())
    })
  }
});

await processor.process();
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
✗ Found 2 errors in 1 files

docs/getting-started.md:
  schema: Invalid datetime string at publishedAt
  schema: Expected array, received string at tags
```

## Features

- ✅ **Zod schema validation** - Type-safe frontmatter at build time
- ✅ **Mustache templating** - Variables, loops, conditionals
- ✅ **File injection** - Include external files with `{{partials.xxx}}`
- ✅ **Glob patterns** - `guides/*.md` expands to multiple files
- ✅ **Security** - Path traversal protection, circular dependency detection
- ✅ **Dynamic injection** - `onBeforeCompile` hook for runtime variable injection
- ✅ **Batch processing** - Process entire directories with one API call

## Installation

```bash
npm install @markdown-di/core
```

## Quick Start

### Batch Processing (Recommended)

Process multiple markdown files with a simple API:

```typescript
import { BatchProcessor, z } from '@markdown-di/core';

const processor = new BatchProcessor({
  baseDir: './docs',
  include: ['**/*.md'],
  exclude: ['node_modules/**'],
  outDir: './dist', // Optional: output to different directory
  schemas: {
    'blog-post': z.object({
      author: z.string(),
      publishedAt: z.string().datetime(),
      tags: z.array(z.string())
    })
  }
});

const result = await processor.process();

if (!result.success) {
  console.error(`Found ${result.totalErrors} errors`);
  process.exit(1);
}

console.log(`✓ Processed ${result.totalFiles} files`);
```

### Single File Processing

For processing individual files:

```typescript
import { MarkdownDI, z } from '@markdown-di/core';

const mdi = new MarkdownDI();

mdi.registerSchema('blog-post', z.object({
  author: z.string(),
  publishedAt: z.string().datetime(),
  tags: z.array(z.string())
}));

const result = await mdi.process({
  content: markdownContent,
  baseDir: './docs',
  currentFile: './docs/post.md'
});

if (result.errors.length > 0) {
  console.error('Validation errors:', result.errors);
}
```

## Use Cases

- **Documentation sites** - Validate 100s of markdown files in CI/CD
- **Content workflows** - Enforce consistent frontmatter across teams
- **AI/Agent systems** - Validate generated markdown at build time
- **API docs** - Type-safe schemas for endpoints, methods, auth
- **Static site generators** - Pre-process markdown with type safety

## Frontmatter Schema

The default schema requires only `name`:

```yaml
---
# Required field
name: string

# Optional: Reference a registered schema
schema: string

# Optional: Partial definitions (file injection)
partials:
  key: path/to/file.md           # Single file
  multi: path/to/*.md             # Glob pattern
  combined:                       # Array of files/patterns
    - path/to/file1.md
    - path/to/*.md

# Optional: Control output frontmatter
output-frontmatter:
  - name
  # Only these fields will appear in the output
---
```

## Mustache Templating

**Note:** HTML escaping is disabled by default since markdown-di works with markdown content, not HTML. All template variables (`{{var}}`) are inserted as-is without escaping special characters.

### Variables

Access any frontmatter field as a variable:

```markdown
---
name: John Doe
age: 30
author:
  name: Jane Smith
  email: jane@example.com
---

# Document by {{name}}

Age: {{age}}
Author: {{author.name}} ({{author.email}})
```

### Sections (Loops)

Iterate over arrays:

```markdown
---
name: Team List
team:
  - name: Alice
    role: Developer
  - name: Bob
    role: Designer
---

# Team Members

{{#team}}
- **{{name}}** - {{role}}
{{/team}}
```

### Conditionals

Use sections for conditional rendering:

```markdown
---
name: Document
published: true
draft: false
---

{{#published}}
This document is published!
{{/published}}

{{^draft}}
This is not a draft.
{{/draft}}
```

### File Injection (Partials)

Inject external file content:

```markdown
---
name: Main Doc
partials:
  header: common/header.md
  footer: common/footer.md
---

{{partials.header}}

# Main Content

{{partials.footer}}
```

## Partial (File Injection) Features

### Single File

```yaml
partials:
  intro: sections/intro.md
```

### Glob Patterns

```yaml
partials:
  guides: guides/*.md           # All markdown files in guides/
  nested: docs/**/*.md          # Recursive glob
```

### Arrays (Multiple Files/Patterns)

```yaml
partials:
  allContent:
    - sections/intro.md
    - guides/*.md
    - docs/advanced/*.md
```

Files matched by globs are:
- Sorted alphabetically for consistency
- Joined with `\n\n` (double newline) between them
- Automatically excluded from `node_modules`, `dist`, and `build` directories

## Schema Validation

### Registering Custom Schemas

Register schemas once, then reference them in frontmatter:

```typescript
import { MarkdownDI, z } from '@markdown-di/core';

const mdi = new MarkdownDI();

// Register a schema
mdi.registerSchema('blog-post', z.object({
  author: z.string(),
  publishedAt: z.string().datetime(),
  tags: z.array(z.string())
}));

// Register multiple schemas
mdi.registerSchemas({
  'api-doc': z.object({
    endpoint: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE'])
  }),
  'tutorial': z.object({
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    duration: z.number()
  })
});
```

### Using Schemas in Frontmatter

Reference a registered schema using the `schema` field:

```markdown
---
schema: blog-post
name: Getting Started
author: Jane Doe
publishedAt: 2024-01-15T10:00:00Z
tags: [tutorial, beginners]
---

# {{name}}

By {{author}}
```

**Important:** Schemas always extend the default schema, so `name` is always required.

## Dynamic Variable Injection

Use the `onBeforeCompile` hook to inject dynamic values at runtime:

```typescript
const processor = new BatchProcessor({
  baseDir: './docs',
  onBeforeCompile: async (context) => ({
    buildTime: new Date().toISOString(),
    version: process.env.VERSION,
    gitCommit: await getGitCommit()
  })
});
```

Mark fields as `$dynamic` in frontmatter to require hook injection:

```markdown
---
name: Documentation
buildTime: $dynamic
version: $dynamic
---

Built at {{buildTime}}
Version: {{version}}
```

## Output Frontmatter Filtering

Control which frontmatter fields appear in the final output:

```yaml
---
name: Public Document
description: This will be in output
author: Internal Team
draft-notes: TODO review
internal-id: ABC123
output-frontmatter:
  - name
  - description
  # Only name and description will appear in the final output
---
```

**Use Cases:**
- Strip internal metadata before publishing
- Remove draft/workflow fields from production documents
- Keep sensitive information in source but not in output

## API Reference

### `BatchProcessor`

Batch processor for multiple markdown files. Simplifies processing entire directories.

#### Constructor

```typescript
new BatchProcessor(config?: BatchConfig)
```

**Config Options:**

```typescript
interface BatchConfig {
  baseDir?: string;              // Base directory (default: process.cwd())
  include?: string[];            // Glob patterns (default: ['**/*.md'])
  exclude?: string[];            // Exclude patterns (default: ['node_modules/**', '.git/**'])
  outDir?: string;               // Output directory (default: in-place updates)
  schemas?: Record<string, z.ZodObject<any>>;  // Schema registry
  onBeforeCompile?: (context: HookContext) => Promise<Record<string, unknown>> | Record<string, unknown>;
  check?: boolean;               // Check mode - don't write files (default: false)
  silent?: boolean;              // Suppress console output (default: false)
}
```

#### `process(): Promise<BatchResult>`

Process all matching files:

```typescript
const result = await processor.process();

// Returns:
interface BatchResult {
  totalFiles: number;
  changedFiles: number;
  totalErrors: number;
  files: FileResult[];
  success: boolean;
}
```

**Examples:**

```typescript
// Process with output directory
const processor = new BatchProcessor({
  baseDir: './docs',
  outDir: './dist',
  schemas: { 'blog-post': blogPostSchema }
});

// Check mode (CI/CD)
const processor = new BatchProcessor({
  baseDir: './docs',
  check: true
});

// With onBeforeCompile hook
const processor = new BatchProcessor({
  baseDir: './docs',
  onBeforeCompile: async (context) => ({
    buildTime: new Date().toISOString(),
    version: process.env.VERSION
  })
});
```

### `MarkdownDI`

Main class for processing individual markdown documents.

#### `process(options: ProcessOptions): Promise<ProcessResult>`

Process a markdown document with dependency injection.

**Options:**

```typescript
interface ProcessOptions {
  content: string;              // Markdown content with frontmatter
  baseDir: string;              // Base directory for resolving file paths
  mode?: 'validate' | 'build';  // Processing mode (default: 'build')
  currentFile?: string;         // Current file path (for circular detection)
  onBeforeCompile?: (context: HookContext) => Promise<Record<string, unknown>> | Record<string, unknown>;
}
```

**Returns:**

```typescript
interface ProcessResult {
  content: string;              // Processed markdown with frontmatter
  frontmatter: FrontmatterData; // Parsed frontmatter object
  errors: ValidationError[];    // All validation errors
  dependencies: string[];       // Resolved file paths (absolute)
}
```

#### `validate(options): Promise<ProcessResult>`

Validate without processing (runs in `mode: 'validate'`):

```typescript
const result = await mdi.validate({
  content,
  baseDir: './docs'
});

// Returns errors but doesn't inject partials
```

#### `registerSchema(name: string, schema: z.ZodSchema): void`

Register a named schema:

```typescript
mdi.registerSchema('blog-post', z.object({
  author: z.string(),
  tags: z.array(z.string())
}));
```

#### `registerSchemas(schemas: Record<string, z.ZodSchema>): void`

Register multiple schemas:

```typescript
mdi.registerSchemas({
  'blog-post': blogPostSchema,
  'api-doc': apiDocSchema
});
```

## Security Features

### Path Traversal Protection

All file paths are validated to prevent escaping the `baseDir`:

```yaml
partials:
  # ❌ These will fail validation
  bad1: ../../../etc/passwd
  bad2: /absolute/path/to/file.md

  # ✅ These are safe
  good1: sections/intro.md
  good2: guides/getting-started.md
```

### Circular Dependency Detection

Automatically detects and prevents circular dependencies:

```
[circular] Circular dependency detected: /docs/A.md -> /docs/B.md -> /docs/A.md
  at /docs/A.md
```

## Error Handling

```typescript
const result = await mdi.process({ content, baseDir });

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`[${error.type}] ${error.message}`);
    console.error(`  at ${error.location}`);
  }
}
```

**Error Types:**
- `frontmatter` - Invalid frontmatter structure
- `partial` - Partial syntax errors
- `file` - File not found or path traversal
- `circular` - Circular dependency detected
- `syntax` - Template syntax errors
- `schema` - Schema validation errors
- `injection` - Dynamic injection errors

## Complete Example

```typescript
import { BatchProcessor, z } from '@markdown-di/core';

const processor = new BatchProcessor({
  baseDir: './blog',
  outDir: './dist',
  schemas: {
    'blog-post': z.object({
      author: z.string(),
      publishedAt: z.string().datetime(),
      tags: z.array(z.string()),
      featured: z.boolean().optional()
    })
  },
  onBeforeCompile: async (context) => ({
    buildTime: new Date().toISOString(),
    siteUrl: 'https://example.com'
  })
});

const result = await processor.process();

if (!result.success) {
  console.error('Validation errors:', result.files
    .filter(f => f.errors.length > 0)
    .map(f => ({ file: f.file, errors: f.errors }))
  );
  process.exit(1);
}

console.log(`✓ Processed ${result.totalFiles} files`);
console.log(`✓ ${result.changedFiles} files updated`);
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  BatchConfig,
  BatchResult,
  FileResult,
  ProcessOptions,
  ProcessResult,
  ValidationError,
  FrontmatterData,
  HookContext
} from '@markdown-di/core';
```

## License

MIT © Pepijn Senders
