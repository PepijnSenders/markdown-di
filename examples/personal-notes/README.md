# Personal Notes Organization Example

This example shows how to use markdown-di to organize and validate personal notes with structured schemas.

## Quick Start

### Using the CLI

```bash
# Build validated notes to dist/
bun ../../packages/cli/dist/index.js build notes/ --output dist/
```

That's it! Your notes are validated and processed with Mustache templates.

## What's Inside

- `notes/` - Meeting notes, daily notes, project tracking, book summaries
- `.markdown-di.json` - JSON Schema validation for each note type
- Schemas for: `meeting-note`, `daily-note`, `project-note`, `book-note`

See the main [markdown-di README](../../README.md) for full documentation.
