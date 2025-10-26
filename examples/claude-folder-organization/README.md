# .claude Folder Organization Example

This example demonstrates how to organize your `.claude` folder with agents and commands using markdown-di for documentation and validation.

## Structure

```
.claude/
├── agents/
│   ├── code-reviewer.md      # Code review agent
│   └── test-generator.md     # Test generation agent
└── commands/
    ├── review-pr.md           # Pull request review command
    └── generate-tests.md      # Test generation command
```

## Schemas

This example defines two schemas:

### Agent Schema
Documents AI agents with:
- Name and description
- System prompt
- Available tools
- Example interactions

### Command Schema
Documents slash commands with:
- Name (kebab-case)
- Description
- Category
- Prompt/instructions

## Usage

### Using the CLI

```bash
# Validate your .claude folder structure
markdown-di validate docs/

# Build documentation
markdown-di build docs/ --output dist/

# With explicit config
markdown-di build docs/ --output dist/ --config .markdown-di.json
```

### Using the Core Package

```typescript
import { MarkdownDI } from '@markdown-di/core'
import { readFileSync } from 'fs'

const mdi = new MarkdownDI()

// Register schemas from config
const config = JSON.parse(readFileSync('.markdown-di.json', 'utf-8'))
for (const [name, schema] of Object.entries(config.schemas)) {
  mdi.registerSchema(name, schema)
}

// Process a markdown file
const content = readFileSync('docs/code-reviewer-agent.md', 'utf-8')
const result = await mdi.process({ content })

if (result.errors.length > 0) {
  console.error('Validation errors:', result.errors)
} else {
  console.log('Generated:', result.output)
}
```

## Benefits

1. **Schema Validation**: Ensure all agents and commands have required fields
2. **Documentation**: Auto-generate documentation from templates
3. **Consistency**: Enforce naming conventions and structure
4. **Discoverability**: Easy to find and understand available agents/commands

## Output

The `dist/` folder contains the processed markdown files with:
- Validated frontmatter
- Rendered templates using Handlebars
- Consistent formatting
- Full documentation for each agent/command
