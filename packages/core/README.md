# markdown-di

**Type-safe Mustache templating for markdown with schema validation.**

Build reliable documentation and content systems with frontmatter schemas that catch errors at build time. Use the CLI for quick validation or the programmatic API for advanced workflows.

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

**Define validation**, validate all documents at build time:

```typescript
import { BatchProcessor } from '@markdown-di/core';
import { z } from 'zod';

// Define your schemas with any validation library (Zod, Yup, etc.)
const schemas = {
  'blog-post': z.object({
    author: z.string(),
    publishedAt: z.string().datetime(),
    tags: z.array(z.string())
  })
};

const processor = new BatchProcessor({
  baseDir: './docs',
  validateFrontmatter: (frontmatter, schemaName) => {
    if (!schemaName || !schemas[schemaName]) {
      return { valid: true, errors: [] };
    }

    const result = schemas[schemaName].safeParse(frontmatter);
    if (result.success) {
      return { valid: true, errors: [], data: result.data };
    }

    return {
      valid: false,
      errors: result.error.issues.map(issue => ({
        type: 'schema',
        message: issue.message,
        location: issue.path.join('.') || 'root'
      }))
    };
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

- ✅ **Schema validation** - Bring your own validation library (Zod, Yup, Ajv, etc.)
- ✅ **CLI tool** - Validate and build markdown files from the command line
- ✅ **Mustache templating** - Variables, loops, conditionals
- ✅ **File injection** - Include external files with `{{partials.xxx}}`
- ✅ **Glob patterns** - `guides/*.md` expands to multiple files
- ✅ **Security** - Path traversal protection, circular dependency detection
- ✅ **Dynamic fields** - `$dynamic` keyword works with hooks and variants API
- ✅ **Multi-variant generation** - One template → many output files with different data
- ✅ **Batch processing** - Process entire directories with one API call

## Installation

### CLI (Recommended for most users)

```bash
npm install -g @markdown-di/cli
# or use npx
npx @markdown-di/cli validate docs/
```

### Programmatic API

```bash
npm install @markdown-di/core
```

## Quick Start

### CLI Usage (Recommended)

The CLI is the easiest way to get started. It uses JSON Schema for validation.

#### 1. Create a config file

Create `.markdown-di.json` in your project root:

```json
{
  "schemas": {
    "blog-post": {
      "type": "object",
      "required": ["author", "publishedAt", "tags"],
      "properties": {
        "author": { "type": "string" },
        "publishedAt": { "type": "string", "format": "date" },
        "tags": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  }
}
```

#### 2. Write markdown with frontmatter

```markdown
---
schema: blog-post
name: Getting Started
author: Jane Doe
publishedAt: 2024-01-15
tags: [tutorial, beginners]
---

# {{name}}

By {{author}}
```

#### 3. Install the CLI

```bash
# Install globally (after publishing)
npm install -g @markdown-di/cli

# Or use with npx (no install needed)
npx @markdown-di/cli --help
```

#### 4. Validate or build

```bash
# Validate files (no output)
npx @markdown-di/cli validate docs/

# Build with processed output
npx @markdown-di/cli build docs/ --output dist/

# Use explicit config path
npx @markdown-di/cli validate docs/ --config path/to/.markdown-di.json
```

The CLI will:
- Auto-discover `.markdown-di.json` by walking up directories
- Validate all frontmatter against your schemas
- Report errors with exact locations
- Process Mustache templates and inject partials

### Programmatic API - Batch Processing

Process multiple markdown files with a simple API:

```typescript
import { BatchProcessor } from '@markdown-di/core';
import { z } from 'zod';

// Define your schemas
const schemas = {
  'blog-post': z.object({
    author: z.string(),
    publishedAt: z.string().datetime(),
    tags: z.array(z.string())
  })
};

const processor = new BatchProcessor({
  baseDir: './docs',
  include: ['**/*.md'],
  exclude: ['node_modules/**'],
  outDir: './dist', // Optional: output to different directory
  validateFrontmatter: (frontmatter, schemaName) => {
    if (!schemaName || !schemas[schemaName]) {
      return { valid: true, errors: [] };
    }

    const result = schemas[schemaName].safeParse(frontmatter);
    if (result.success) {
      return { valid: true, errors: [], data: result.data };
    }

    return {
      valid: false,
      errors: result.error.issues.map(issue => ({
        type: 'schema',
        message: issue.message,
        location: issue.path.join('.') || 'root'
      }))
    };
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
import { MarkdownDI } from '@markdown-di/core';
import { z } from 'zod';

const mdi = new MarkdownDI();

const schemas = {
  'blog-post': z.object({
    author: z.string(),
    publishedAt: z.string().datetime(),
    tags: z.array(z.string())
  })
};

const result = await mdi.process({
  content: markdownContent,
  baseDir: './docs',
  currentFile: './docs/post.md',
  validateFrontmatter: (frontmatter, schemaName) => {
    if (!schemaName || !schemas[schemaName]) {
      return { valid: true, errors: [] };
    }

    const result = schemas[schemaName].safeParse(frontmatter);
    if (result.success) {
      return { valid: true, errors: [], data: result.data };
    }

    return {
      valid: false,
      errors: result.error.issues.map(issue => ({
        type: 'schema',
        message: issue.message,
        location: issue.path.join('.') || 'root'
      }))
    };
  }
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

### Custom Delimiters

You can customize the Mustache template delimiters (default is `{{` and `}}`). This is useful when working with content that already uses the default delimiters or when you prefer alternative syntax.

#### Using with CLI

Add to your `.markdown-di.json` config file:

```json
{
  "schemas": {},
  "mustache": {
    "tags": ["<%", "%>"]
  }
}
```

Then use the custom delimiters in your markdown:

```markdown
---
name: Example
author: John Doe
---

# <% name %>

By <% author %>
```

#### Using Programmatically

```typescript
import { MarkdownDI } from '@markdown-di/core';

const mdi = new MarkdownDI();

const result = await mdi.process({
  content: markdownContent,
  baseDir: './docs',
  mustache: {
    tags: ['<%', '%>']
  }
});
```

#### With Batch Processing

```typescript
import { BatchProcessor } from '@markdown-di/core';

const processor = new BatchProcessor({
  baseDir: './docs',
  mustache: {
    tags: ['<%', '%>']
  }
});

await processor.process();
```

**Note:** Custom delimiters work with all Mustache features including variables, sections, conditionals, and partials.

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

### Partials with Frontmatter and Variables

Partials can have their own frontmatter with variables that support:
- **Access to parent variables**: Partials can use any variable from the parent document
- **Variable overrides**: Partial frontmatter takes precedence over parent values
- **Parent references**: Use `$parent` or `$parent('key')` to explicitly get parent values
- **Nested partials**: Partials can include other partials

#### Example: Partial Using Parent Variables

**Parent document** (`main.md`):
```markdown
---
name: Product Documentation
author: John Doe
version: 2.0
theme: dark

partials:
  header: sections/header.md
---

{{partials.header}}
```

**Partial with frontmatter** (`sections/header.md`):
```markdown
---
name: Header Section
description: Auto-generated header
---

# {{name}}

Version: {{version}} | Author: {{author}} | Theme: {{theme}}
```

**Result**: The partial can access `version`, `author`, and `theme` from the parent, while using its own `name`.

#### Example: Using `$parent` to Reference Parent Variables

Use `$parent` when you want the exact value from the parent with the same key:

```markdown
---
name: Header
author: $parent
theme: $parent
---

# {{name}}

By {{author}} - {{theme}} theme
```

Use `$parent('key')` to get a parent variable with a different key:

```markdown
---
name: Header
title: $parent('name')
authorName: $parent('author')
---

# {{name}}

Document: {{title}}
Written by: {{authorName}}
```

#### Example: Nested Partials

Partials can include other partials, creating a hierarchy:

**Main document**:
```markdown
---
name: Main Doc
author: Alice
theme: light

partials:
  layout: partials/layout.md
---

{{partials.layout}}
```

**Layout partial** (`partials/layout.md`):
```markdown
---
name: Layout
partials:
  header: partials/header.md
  footer: partials/footer.md
---

{{partials.header}}

Main content area

{{partials.footer}}
```

**Header partial** (`partials/header.md`):
```markdown
---
name: Site Header
---

# {{name}}

By {{author}} | Theme: {{theme}}
```

All nested partials have access to the parent document's variables (`author`, `theme`), while each can define their own `name`.

## Schema Validation

markdown-di lets you bring your own validation library. Use Zod, Yup, Ajv, or any other validation library by providing a `validateFrontmatter` callback.

### Using with Zod

```typescript
import { MarkdownDI } from '@markdown-di/core';
import { z } from 'zod';

const schemas = {
  'blog-post': z.object({
    author: z.string(),
    publishedAt: z.string().datetime(),
    tags: z.array(z.string())
  })
};

const result = await mdi.process({
  content: markdownContent,
  baseDir: './docs',
  validateFrontmatter: (frontmatter, schemaName) => {
    if (!schemaName || !schemas[schemaName]) {
      return { valid: true, errors: [] };
    }

    const result = schemas[schemaName].safeParse(frontmatter);
    if (result.success) {
      return { valid: true, errors: [], data: result.data };
    }

    return {
      valid: false,
      errors: result.error.issues.map(issue => ({
        type: 'schema',
        message: issue.message,
        location: issue.path.join('.') || 'root'
      }))
    };
  }
});
```

### Using with Ajv (JSON Schema)

```typescript
import { MarkdownDI } from '@markdown-di/core';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv();
addFormats(ajv);

const schemas = {
  'blog-post': {
    type: 'object',
    required: ['author', 'date'],
    properties: {
      author: { type: 'string', minLength: 1 },
      date: { type: 'string', format: 'date' },
      tags: { type: 'array', items: { type: 'string' } }
    }
  }
};

// Compile schemas
Object.entries(schemas).forEach(([name, schema]) => {
  ajv.addSchema(schema, name);
});

const result = await mdi.process({
  content: markdownContent,
  baseDir: './docs',
  validateFrontmatter: (frontmatter, schemaName) => {
    if (!schemaName) {
      return { valid: true, errors: [] };
    }

    const validate = ajv.getSchema(schemaName);
    if (!validate) {
      return {
        valid: false,
        errors: [{
          type: 'schema',
          message: `Schema '${schemaName}' not found`,
          location: 'root'
        }]
      };
    }

    const valid = validate(frontmatter);
    if (valid) {
      return { valid: true, errors: [] };
    }

    return {
      valid: false,
      errors: (validate.errors || []).map(err => ({
        type: 'schema',
        message: err.message || 'Validation error',
        location: err.instancePath.slice(1) || 'root'
      }))
    };
  }
});
```

### Using with Yup

```typescript
import { MarkdownDI } from '@markdown-di/core';
import * as yup from 'yup';

const schemas = {
  'blog-post': yup.object({
    author: yup.string().required(),
    publishedAt: yup.date().required(),
    tags: yup.array().of(yup.string()).required()
  })
};

const result = await mdi.process({
  content: markdownContent,
  baseDir: './docs',
  validateFrontmatter: async (frontmatter, schemaName) => {
    if (!schemaName || !schemas[schemaName]) {
      return { valid: true, errors: [] };
    }

    try {
      const data = await schemas[schemaName].validate(frontmatter, { abortEarly: false });
      return { valid: true, errors: [], data };
    } catch (err) {
      if (err instanceof yup.ValidationError) {
        return {
          valid: false,
          errors: err.inner.map(e => ({
            type: 'schema',
            message: e.message,
            location: e.path || 'root'
          }))
        };
      }
      throw err;
    }
  }
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

Mark fields as `$dynamic` in frontmatter to require dynamic data:

```markdown
---
name: Documentation
buildTime: $dynamic
version: $dynamic
---

Built at {{buildTime}}
Version: {{version}}
```

**Note:** The `$dynamic` keyword works with both:
- The `onBeforeCompile` hook (as shown above)
- The variants API (see [Multi-Variant Template Generation](#multi-variant-template-generation))
- Both combined (hook + variant data)

## Multi-Variant Template Generation

Generate multiple output files from a single template with different data for each variant. Perfect for creating product pages, documentation in multiple languages, or any scenario where you need many similar files with different values.

```typescript
const processor = new BatchProcessor({
  baseDir: './templates',
  outDir: './dist',
  variants: {
    'product-template': {
      data: [
        { product: 'Widget A', price: '$10', sku: 'WA-001' },
        { product: 'Widget B', price: '$20', sku: 'WB-001' },
        { product: 'Widget C', price: '$30', sku: 'WC-001' }
      ],
      getOutputPath: (context, data, index) => {
        const slug = data.product.toLowerCase().replace(/\s+/g, '-')
        return `products/${slug}.md`
      }
    }
  }
})
```

**Template file** (`templates/product.md`):
```markdown
---
id: product-template
name: Product Template
---

# {{product}}

Price: {{price}}
SKU: {{sku}}
```

**Generated output:**
- `dist/products/widget-a.md`
- `dist/products/widget-b.md`
- `dist/products/widget-c.md`

**Key features:**
- Each variant gets its own output file
- Custom output path via `getOutputPath` callback
- Original template is not written (only variants)
- Works with `onBeforeCompile` for additional dynamic data
- File-specific variants via `id` field in frontmatter

### Using `$dynamic` Fields with Variants

The `$dynamic` keyword works seamlessly with the variants API. Mark fields as `$dynamic` in your template, and provide values via the variant data:

**Template file** (`templates/command.md`):
```markdown
---
id: command-template
name: $dynamic
command: $dynamic
description: $dynamic
---

# {{name}}

Command: `{{command}}`

{{description}}
```

**Variant configuration:**
```typescript
const processor = new BatchProcessor({
  baseDir: './templates',
  outDir: './dist',
  variants: {
    'command-template': {
      data: [
        {
          name: 'Recipe Command',
          command: '/recipe',
          description: 'Generate cooking recipes'
        },
        {
          name: 'Code Command',
          command: '/code',
          description: 'Generate code snippets'
        }
      ],
      getOutputPath: (context, data, index) =>
        `commands/${data.command.replace('/', '')}.md`
    }
  }
});
```

**Generated output:**
- `dist/commands/recipe.md` with recipe data
- `dist/commands/code.md` with code data

**Important:** If you mark fields as `$dynamic`, you must provide them via either:
- The variants API (as shown above)
- The `onBeforeCompile` hook
- Both combined (hook values + variant data)

If any `$dynamic` fields remain unresolved, you'll get a clear error message.

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

## CLI Reference

The `@markdown-di/cli` package provides command-line tools for validation and building.

### Installation

```bash
# Global installation
npm install -g @markdown-di/cli

# Or use with npx
npx @markdown-di/cli validate docs/
```

### Commands

#### `validate <input>`

Validate markdown files without writing output. Perfect for CI/CD pipelines.

```bash
# Validate single file
npx @markdown-di/cli validate docs/post.md

# Validate directory
npx @markdown-di/cli validate docs/

# Validate with glob pattern
npx @markdown-di/cli validate "docs/**/*.md"

# Use explicit config
npx @markdown-di/cli validate docs/ --config path/to/.markdown-di.json
```

**Options:**
- `-c, --config <path>` - Path to config file (overrides auto-discovery)

**Exit codes:**
- `0` - All files valid
- `1` - Validation errors found

#### `build <input>`

Build markdown files with dependency injection and optional output directory.

```bash
# Build single file to output directory
npx @markdown-di/cli build docs/post.md --output dist/

# Build entire directory
npx @markdown-di/cli build docs/ --output dist/

# Build in-place (overwrites source files)
npx @markdown-di/cli build docs/

# Use explicit config
npx @markdown-di/cli build docs/ --output dist/ --config .markdown-di.json
```

**Options:**
- `-o, --output <dir>` - Output directory for processed files
- `-c, --config <path>` - Path to config file (overrides auto-discovery)
- `-w, --watch` - Watch mode (not yet implemented)

### Config File

The CLI looks for config files in this order:
1. Path specified with `--config` flag
2. `.markdown-di.json` (auto-discovered by walking up directories)
3. `.markdown-di.schemas.json`
4. `markdown-di.config.json`

**Config format:**

```json
{
  "schemas": {
    "schema-name": {
      "type": "object",
      "required": ["field1"],
      "properties": {
        "field1": { "type": "string" },
        "field2": { "type": "number" }
      }
    }
  },
  "mustache": {
    "tags": ["<%", "%>"]
  }
}
```

**Config options:**
- `schemas` - JSON Schema definitions for frontmatter validation
- `mustache` - Optional Mustache template engine configuration
  - `tags` - Custom delimiters (default: `["{{", "}}"]`)

The config file uses standard [JSON Schema](https://json-schema.org/) format with support for:
- Type validation (`string`, `number`, `boolean`, `array`, `object`, `null`)
- Format validation (`date`, `date-time`, `email`, `uri`, `uuid`, etc.)
- Array items validation
- Nested objects
- Required fields
- Min/max constraints

### CI/CD Integration

Use the validate command in your CI pipeline:

```yaml
# GitHub Actions example
- name: Validate markdown
  run: npx @markdown-di/cli validate docs/

# Will exit with code 1 if validation fails
```

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
  validateFrontmatter?: (frontmatter: FrontmatterData, schemaName?: string) => SchemaValidationResult | Promise<SchemaValidationResult>;
  onBeforeCompile?: (context: HookContext) => Promise<Record<string, unknown>> | Record<string, unknown>;
  variants?: Record<string, VariantGenerator>;  // Multi-variant generation config
  mustache?: MustacheConfig;     // Custom Mustache template engine configuration
  check?: boolean;               // Check mode - don't write files (default: false)
  silent?: boolean;              // Suppress console output (default: false)
}

interface MustacheConfig {
  tags?: [string, string];       // Custom delimiters (default: ['{{', '}}'])
}

interface VariantGenerator {
  data: Record<string, unknown>[];  // Array of data objects, one per variant
  getOutputPath: (context: HookContext, data: Record<string, unknown>, index: number) => string;
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
  validateFrontmatter: myValidationFunction
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
  mustache?: MustacheConfig;    // Custom Mustache template engine configuration
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

## Examples

Check out the [`examples/`](./examples) directory for real-world use cases:

### [.claude Folder Organization](./examples/claude-folder-organization)
Organize and document Claude Code agents and commands with schema validation.

**Features:**
- Agent schema with system prompts, tools, and examples
- Command schema with categories and usage patterns
- Auto-generated documentation with consistent structure
- Validation for naming conventions and required fields

**Use cases:**
- Document AI agents and their capabilities
- Standardize slash commands across projects
- Ensure consistency in .claude folder structure

[View Example →](./examples/claude-folder-organization)

### [Personal Notes Organization](./examples/personal-notes)
Manage personal notes, meeting notes, projects, and book summaries with type-safe schemas.

**Features:**
- Meeting notes with attendees, topics, and action items
- Daily notes with mood tracking and focus areas
- Project tracking with status, milestones, and links
- Book notes with ratings and reading progress

**Use cases:**
- Personal knowledge management
- Team meeting documentation
- Project tracking and planning
- Reading list and book summaries

[View Example →](./examples/personal-notes)

### [Slash Commands with Variants API](./examples/slash-commands-variants)
Generate multiple Claude Code slash commands from a single template using the variants API.

**Features:**
- One template generates 5 recipe management commands
- Type-safe variant data in TypeScript
- Dynamic output paths via `getOutputPath` callback
- Demonstrates `$dynamic` fields and `onBeforeCompile` hook

**Use cases:**
- Generate multiple similar slash commands efficiently
- Maintain consistency across command definitions
- Avoid manual duplication or LLM generation
- Create command families with shared structure

[View Example →](./examples/slash-commands-variants)

All examples include:
- ✅ Complete JSON Schema definitions
- ✅ Sample markdown files with Mustache templates
- ✅ Pre-built `dist/` folders showing output
- ✅ CLI and programmatic usage examples
- ✅ README with setup instructions

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
  HookContext,
  MustacheConfig
} from '@markdown-di/core';
```

## License

MIT © Pepijn Senders
