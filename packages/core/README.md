# @markdown-di/core

Parser-agnostic dependency injection for markdown using frontmatter.

## Features

- ✅ Frontmatter dependency schema validation
- ✅ Reference parsing (finding `{{...}}` patterns)
- ✅ Reference validation (ensure refs exist in frontmatter)
- ✅ Dependency resolution (refs → file paths)
- ✅ Glob expansion
- ✅ Basic string-replacement transclusion

## Installation

```bash
bun add @markdown-di/core
```

## Usage

```typescript
import { MarkdownDI } from '@markdown-di/core';

const mdi = new MarkdownDI();

const result = await mdi.process({
  content: `---
name: my-doc
blueprints:
  sections:
    intro: sections/intro.md
---

# My Document

{{sections.intro}}
`,
  baseDir: './docs'
});

console.log(result.content); // Processed markdown
console.log(result.errors);  // Validation errors (if any)
```

## API

### `MarkdownDI`

Main class for processing markdown with dependency injection.

#### `process(options)`

Process a markdown document.

**Options:**
- `content` (string) - Markdown content with frontmatter
- `baseDir` (string) - Base directory for resolving file paths
- `mode` (optional) - Processing mode: `'validate'` or `'build'` (default: `'build'`)

**Returns:**
```typescript
{
  content: string;           // Processed markdown
  frontmatter: object;       // Parsed frontmatter
  errors: ValidationError[]; // Validation errors
  dependencies: string[];    // Resolved file paths
}
```

### Frontmatter Schema

```yaml
---
# Required
name: string
description: string

# Optional: Blueprint dependencies
blueprints:
  group-name:
    key: path/to/file.md

# Optional: Reference dependencies (supports globs)
references:
  group-name:
    - path/to/file.md
    - path/with/*.md
---
```

### Reference Syntax

- `{{blueprints.group.key}}` - Nested blueprint reference
- `{{group.key}}` - Shorthand (assumes blueprints)
- `{{references.group}}` - All files in group
- `{{references}}` - All groups concatenated

## Validation Rules

The core validates:

1. **Frontmatter structure** - Required fields, correct types
2. **Reference format** - `{{...}}` patterns must follow allowed syntax
3. **Reference existence** - All refs must be declared in frontmatter
4. **File existence** - All declared paths must exist
5. **No circular dependencies** - Prevent infinite loops

## Error Handling

```typescript
const result = await mdi.process({ content, baseDir });

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`${error.type}: ${error.message}`);
    console.error(`  at ${error.location}`);
  }
}
```

## License

MIT © Pepijn Senders
