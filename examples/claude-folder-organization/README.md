# .claude Folder Organization Example

This example shows how to organize and validate your `.claude` folder for Claude Code using markdown-di.

## Quick Start

### Using the CLI

```bash
# Build the .claude folder from docs/
bun ../../packages/cli/dist/index.js build docs/ --output .claude/
```

That's it! Your `.claude` folder is ready to use with validated agents and commands.

## What's Inside

- `docs/agents/` - Agent definitions with full metadata
- `docs/commands/` - Slash command definitions
- `.markdown-di.json` - JSON Schema validation rules
- `output-frontmatter` controls what fields go to `.claude/`

See the main [markdown-di README](../../README.md) for full documentation.
