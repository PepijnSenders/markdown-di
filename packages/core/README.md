# @markdown-di/core

Parser-agnostic dependency injection for markdown using frontmatter and Mustache templating.

## Features

- **Frontmatter Schema Validation** - Validate frontmatter structure with Zod schemas (built-in and custom)
- **Mustache Templating** - Full Mustache template syntax support for variables, sections, and partials
- **File Injection (Partials)** - Inject content from external files using `{{partials.xxx}}` syntax
- **Glob Pattern Support** - Use glob patterns to include multiple files at once
- **Dependency Resolution** - Automatic file path resolution with circular dependency detection
- **Path Traversal Protection** - Built-in security to prevent unauthorized file access
- **Output Frontmatter Filtering** - Control which frontmatter fields appear in the final output
- **Flexible Processing Modes** - Validate-only or full build mode
- **Schema Registry** - Register and reuse custom schemas across documents

## Installation

```bash
bun add @markdown-di/core
```

## Quick Start

```typescript
import { MarkdownDI } from '@markdown-di/core';

const mdi = new MarkdownDI();

const result = await mdi.process({
  content: `---
name: my-doc
description: Example document
partials:
  intro: sections/intro.md
---

# My Document

{{partials.intro}}
`,
  baseDir: './docs'
});

console.log(result.content); // Processed markdown
console.log(result.errors);  // Validation errors (if any)
```

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

## Mustache Template Syntax

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
description: Document with injected content
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

### Mixed Single and Glob

```yaml
partials:
  content:
    - sections/intro.md         # Specific file
    - guides/getting-*.md       # Pattern
    - guides/advanced.md        # Another specific file
```

Files matched by globs are:
- Sorted alphabetically for consistency
- Joined with `\n\n` (double newline) between them
- Automatically excluded from `node_modules`, `dist`, and `build` directories

## Schema Validation

### Using the Default Schema

The default schema only requires `name`:

```typescript
const mdi = new MarkdownDI();
const result = await mdi.process({
  content: `---
name: My Document
partials:
  intro: sections/intro.md
---

# {{name}}

{{partials.intro}}
`,
  baseDir: './docs'
});

// result.errors will contain schema validation errors if name is missing
```

### Registering Custom Schemas

Register schemas once, then reference them in frontmatter:

```typescript
import { MarkdownDI, z } from '@markdown-di/core';

const mdi = new MarkdownDI();

// Register a schema
mdi.registerSchema('blog-post', z.object({
  author: z.string(),
  publishedAt: z.string().datetime(),
  tags: z.array(z.string()),
  description: z.string().optional()
}));

// Register multiple schemas
mdi.registerSchemas({
  'api-doc': z.object({
    endpoint: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
    description: z.string()
  }),
  'tutorial': z.object({
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    duration: z.number(),
    description: z.string().optional()
  })
});
```

### Using Schemas in Frontmatter

Reference a registered schema in the frontmatter using the `schema` field:

```typescript
const content = `---
schema: blog-post
name: Getting Started
author: Jane Doe
publishedAt: 2024-01-15T10:00:00Z
tags: [tutorial, beginners]
---

# {{name}}

By {{author}}
`;

const result = await mdi.process({
  content,
  baseDir: './docs'
});

// The 'blog-post' schema will be applied automatically
// Validation errors will appear in result.errors if fields don't match
```

**Important:** Schemas always extend the default schema, so `name` is always required. Additional fields from your custom schema are validated on top of the base requirements.

### Standalone Schema Validation

```typescript
import { SchemaValidator, z } from '@markdown-di/core';

// Validate data directly
const validator = new SchemaValidator({
  schema: z.object({
    author: z.string(),
    version: z.string()
  }),
  extend: true
});

const result = validator.validate({
  name: 'Doc',
  description: 'A document',
  author: 'John Doe',
  version: '1.0.0'
});

if (!result.valid) {
  console.error(result.errors);
}

// Validate a file
const fileResult = await SchemaValidator.validateFile(
  './docs/example.md',
  { schema: mySchema, extend: true }
);
```

## Output Frontmatter Filtering

Control which frontmatter fields appear in the final output using `output-frontmatter`:

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
  # author, draft-notes, and internal-id will be stripped
---
```

**Important:** The `output-frontmatter` field itself is never included in the output, even if listed.

**Use Cases:**
- Strip internal metadata before publishing
- Remove draft/workflow fields from production documents
- Keep sensitive information in source but not in output
- Maintain clean, minimal frontmatter in generated files

**Backward Compatibility:** If `output-frontmatter` is not specified, ALL frontmatter fields are included in the output (existing behavior).

## API Reference

### `MarkdownDI`

Main class for processing markdown documents.

#### `process(options: ProcessOptions): Promise<ProcessResult>`

Process a markdown document with dependency injection.

**Options:**

```typescript
interface ProcessOptions {
  content: string;              // Markdown content with frontmatter
  baseDir: string;              // Base directory for resolving file paths
  mode?: 'validate' | 'build';  // Processing mode (default: 'build')
  currentFile?: string;         // Current file path (for circular detection)
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

**Error Types:**

```typescript
interface ValidationError {
  type: 'frontmatter' | 'partial' | 'file' | 'circular' | 'syntax' | 'schema' | 'injection';
  message: string;
  location: string;
  details?: any;
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

#### `getSchema(name: string): z.ZodSchema | undefined`

Get a registered schema by name:

```typescript
const schema = mdi.getSchema('blog-post');
```

### `SchemaValidator`

Standalone schema validation (without document processing).

```typescript
import { SchemaValidator, z } from '@markdown-di/core';

const validator = new SchemaValidator({
  schema: z.object({ author: z.string() }),
  extend: true
});

// Validate data
const result = validator.validate(data);

// Validate a file
const fileResult = await validator.validateFile('./doc.md', {
  schema: mySchema,
  extend: true
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
  bad3: section/../../../secrets.txt

  # ✅ These are safe
  good1: sections/intro.md
  good2: guides/getting-started.md
```

Error when path traversal is detected:

```typescript
{
  type: 'file',
  message: 'Path traversal not allowed: "../../../etc/passwd" escapes base directory',
  location: 'partials.bad1'
}
```

### Circular Dependency Detection

Automatically detects and prevents circular dependencies:

```typescript
// If file A includes B, and B includes A:
{
  type: 'circular',
  message: 'Circular dependency detected: /path/to/A.md -> /path/to/B.md -> /path/to/A.md',
  location: '/path/to/A.md'
}
```

## Validation Rules

The processor validates:

1. **Frontmatter Structure** - Required field (`name`), correct types
2. **Reference Syntax** - `{{...}}` patterns must be valid Mustache syntax
3. **Schema Compliance** - Custom schema validation (if `schema` field is present in frontmatter)
4. **Schema Registration** - Referenced schema must be registered via `registerSchema()`
5. **Partial Existence** - Partials referenced in `{{partials.xxx}}` must be declared in frontmatter
6. **File Existence** - All files and glob patterns must resolve to existing files
7. **Path Safety** - No path traversal or escaping baseDir
8. **Circular Dependencies** - No files can depend on themselves (directly or indirectly)

## Processing Modes

### Build Mode (Default)

Fully processes the document with all injections:

```typescript
const result = await mdi.process({
  content,
  baseDir: './docs',
  mode: 'build'  // or omit (default)
});
```

### Validate Mode

Only validates, doesn't inject partials:

```typescript
const result = await mdi.validate({
  content,
  baseDir: './docs'
});

// Checks for errors but doesn't modify content
```

Useful for:
- CI/CD validation pipelines
- Pre-commit hooks
- Documentation linting
- Checking for broken references before build

## Error Handling

```typescript
const result = await mdi.process({ content, baseDir });

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`[${error.type}] ${error.message}`);
    console.error(`  at ${error.location}`);
    if (error.details) {
      console.error(`  details:`, error.details);
    }
  }
}
```

Example error output:

```
[file] Partial file not found: sections/missing.md
  at partials.intro

[schema] Schema "blog-post" not found in registry. Register it with registerSchema() first.
  at frontmatter.schema

[schema] Expected string, received number
  at author.name

[injection] Partial '{{partials.unknown}}' is not defined in frontmatter
  at content

[circular] Circular dependency detected: /docs/A.md -> /docs/B.md -> /docs/A.md
  at /docs/A.md
```

## Complete Example

```typescript
import { MarkdownDI, z } from '@markdown-di/core';

const mdi = new MarkdownDI();

// Register custom schema
mdi.registerSchema('blog-post', z.object({
  author: z.string(),
  publishedAt: z.string().datetime(),
  tags: z.array(z.string()),
  featured: z.boolean().optional(),
  description: z.string().optional()
}));

const content = `---
schema: blog-post
name: Getting Started Guide
description: A comprehensive introduction to our product
author: Jane Doe
publishedAt: 2024-01-15T10:00:00Z
tags: [tutorial, beginners]
featured: true
partials:
  header: common/blog-header.md
  intro: guides/*.md
  footer: common/footer.md
output-frontmatter:
  - name
  - description
  - author
  - publishedAt
  - tags
  - featured
---

{{partials.header}}

# {{name}}

By {{author}} on {{publishedAt}}

{{#tags}}
- {{.}}
{{/tags}}

{{partials.intro}}

---

{{partials.footer}}
`;

const result = await mdi.process({
  content,
  baseDir: './blog'
});

if (result.errors.length > 0) {
  console.error('Validation errors:', result.errors);
  process.exit(1);
}

console.log('Processed content:', result.content);
console.log('Dependencies:', result.dependencies);
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  ProcessOptions,
  ProcessResult,
  ValidationError,
  FrontmatterData,
  DependencyReference,
  ProcessingContext
} from '@markdown-di/core';
```

## License

MIT © Pepijn Senders
