# Slash Commands with Variants API

This example demonstrates how to use markdown-di's **variants API** to generate multiple slash commands from a single template using the programmatic API. One template generates 5 different recipe management commands.

## Why Use Variants?

When you have multiple similar commands that differ only in their data (descriptions, tools, arguments), the variants API lets you:

- **Define variations programmatically** - All command data in one TypeScript file
- **Single source of truth** - One template for all commands
- **Type safety** - TypeScript ensures consistency across variants
- **Easy to extend** - Add a new command by adding one object to the `data` array

This is **much easier than** having an LLM generate similar commands or manually maintaining multiple command files.

## What This Generates

From a single template file, we generate 5 recipe management slash commands:

1. `/recipe-create` - Create a new recipe from ingredients and instructions
2. `/recipe-search` - Search for recipes by ingredient or cuisine type
3. `/recipe-convert` - Convert recipe measurements between metric and imperial
4. `/recipe-analyze` - Analyze recipe nutrition and suggest healthier alternatives
5. `/recipe-suggest` - Suggest recipes based on available ingredients

## Quick Start

```bash
# Install dependencies
bun install

# Generate all 5 slash commands
bun run generate.ts
```

This will create 5 markdown files in `.claude/commands/`:

```
.claude/commands/
├── recipe-create.md
├── recipe-search.md
├── recipe-convert.md
├── recipe-analyze.md
└── recipe-suggest.md
```

These files are ready to use with Claude Code!

## How It Works

### 1. Create a Template with an `id` Field

The template file (`templates/recipe-command.md`) has an `id` field in its frontmatter:

```markdown
---
id: recipe-command
name: {{command}}
description: {{description}}
allowed-tools: {{#allowedTools}}{{.}}{{^@last}}, {{/@last}}{{/allowedTools}}
---

{{actionDetails}}
```

The `id` field connects this template to the variant configuration.

### 2. Configure Variants in TypeScript

In `generate.ts`, use `BatchProcessor` with a `variants` config:

```typescript
import { BatchProcessor } from '@markdown-di/core';

const processor = new BatchProcessor({
  baseDir: join(__dirname, 'templates'),
  outDir: join(__dirname, '.claude/commands'),

  variants: {
    // This key matches the 'id' in the template
    'recipe-command': {
      // Array of data - one object per command
      data: [
        {
          command: 'recipe-create',
          description: 'Create a new recipe...',
          allowedTools: ['Write', 'Read', 'Glob'],
          argumentHint: '[recipe-name]',
          // ... more fields
        },
        {
          command: 'recipe-search',
          description: 'Search for recipes...',
          allowedTools: ['Grep', 'Glob', 'Read'],
          // ... more fields
        },
        // ... 3 more variants
      ],

      // Determine output filename for each variant
      getOutputPath: (_context, data, _index) => {
        return `${data.command}.md`;
      }
    }
  }
});
```

### 3. Run the Generator

```typescript
const result = await processor.process();

if (!result.success) {
  console.error('Errors:', result.totalErrors);
  process.exit(1);
}

console.log(`Generated ${result.changedFiles} files`);
```

## Key Features

### Type-Safe Variant Data

All variant data is in TypeScript, giving you:

- Autocomplete for field names
- Type checking for values
- Easy refactoring across all variants

### Dynamic Output Paths

The `getOutputPath` callback controls where each variant file goes:

```typescript
getOutputPath: (_context, data, _index) => {
  // Use variant data to determine filename
  return `${data.command}.md`;

  // Or create nested structures:
  // return `${data.category}/${data.command}.md`;
}
```

### Template Variables

Templates use Mustache syntax to reference variant data:

```markdown
---
name: {{command}}
description: {{description}}
allowed-tools: {{#allowedTools}}{{.}}{{^@last}}, {{/@last}}{{/allowedTools}}
---

# {{command}} Command

{{actionDetails}}
```

### Output Frontmatter Filtering

Control which fields appear in generated files:

```yaml
output-frontmatter:
  - description
  - allowed-tools
  - model
  # Internal fields like 'id' and 'command' are excluded
```

## Adding a New Command

Want to add a 6th command? Just add a new object to the `data` array:

```typescript
{
  command: 'recipe-scale',
  description: 'Scale recipe servings up or down',
  allowedTools: ['Read', 'Edit'],
  argumentHint: '[recipe-file] [servings]',
  model: 'claude-sonnet-4-5-20250929',
  actionDetails: `...`
}
```

Run `bun run generate.ts` again, and `/recipe-scale` will be created!

## Project Structure

```
slash-commands-variants/
├── generate.ts              # TypeScript generator with variants config
├── templates/
│   └── recipe-command.md    # Single template with id field
└── .claude/
    └── commands/            # Generated commands (5 files)
        ├── recipe-create.md
        ├── recipe-search.md
        ├── recipe-convert.md
        ├── recipe-analyze.md
        └── recipe-suggest.md
```

## Comparison with Other Approaches

### ❌ Without Variants (Manual Maintenance)

- Create 5 separate `.md` files manually
- Copy-paste structure, risk inconsistencies
- Hard to ensure all commands follow the same format
- Updating the format requires changing 5 files

### ❌ LLM Generation

- Prompt an LLM to generate each command
- Non-deterministic results
- Inconsistent formatting
- Requires careful prompting for each variant

### ✅ With Variants API

- One template, one TypeScript config
- Deterministic, consistent output
- Type-safe variant data
- Easy to add/remove/modify commands

## Using the Generated Commands

The generated commands work with Claude Code's slash command system. Users can invoke them like:

```bash
/recipe-create chocolate-chip-cookies
/recipe-search vegetarian pasta
/recipe-convert recipes/banana-bread.md metric
```

## See Also

- [Variants API Documentation](../../README.md#multi-variant-template-generation) - Complete API reference
- [Slash Commands Documentation](https://docs.claude.com/en/api/agent-sdk/slash-commands)
- [BatchProcessor API](../../README.md#batchprocessor)
