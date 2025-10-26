# .claude Folder Organization Example

This example demonstrates how to organize your `.claude` folder with sub-agents and slash commands using markdown-di for documentation and validation.

## Directory Structure

```
.
├── .claude/                           # Claude Code configuration
│   ├── agents/                       # Sub-agent definitions
│   │   ├── code-reviewer.md         # Code review agent
│   │   └── test-generator.md        # Test generation agent
│   └── commands/                     # Slash command definitions
│       ├── review-pr.md              # PR review command
│       └── generate-tests.md         # Test generation command
├── docs/                             # Documentation sources (with Mustache templates)
│   ├── agents/
│   │   ├── code-reviewer.md         # Agent documentation with validation
│   │   └── test-generator.md
│   └── commands/
│       ├── review-pr.md
│       └── generate-tests.md
├── dist/                             # Built output
│   ├── .claude/                     # Ready-to-use .claude folder
│   │   ├── agents/
│   │   └── commands/
│   └── docs/                        # Generated documentation
│       └── agents/
└── .markdown-di.json                 # Schema validation config
```

## The `.claude` Folder

This follows the [official Claude Code structure](https://docs.claude.com/en/docs/claude-code/sub-agents):

### Agents (`.claude/agents/`)

Sub-agents are specialized AI assistants stored as Markdown files with YAML frontmatter:

```markdown
---
name: code-reviewer
description: Expert code reviewer. Use proactively after code changes.
tools: Read, Grep, Glob
model: sonnet
---

Your system prompt goes here...
```

**Key Fields:**
- `name` (required): Unique identifier (lowercase, hyphens)
- `description` (required): When this agent should be invoked
- `tools` (optional): Comma-separated tool list
- `model` (optional): `sonnet`, `opus`, `haiku`, or `inherit`

### Commands (`.claude/commands/`)

Slash commands are simple Markdown files containing the command prompt:

```markdown
Review the current pull request:

1. Check out the PR branch
2. Read all changed files
3. Analyze code quality...
```

The filename (without `.md`) becomes the command name: `review-pr.md` → `/review-pr`

## Validation & Documentation

This example uses markdown-di to:

1. **Validate** agent configurations against JSON Schema
2. **Generate documentation** with Mustache templates
3. **Maintain consistency** across agents and commands

### Schemas

The `.markdown-di.json` file defines validation rules:

```json
{
  "schemas": {
    "agent": {
      "type": "object",
      "required": ["name", "description"],
      "properties": {
        "name": {
          "type": "string",
          "pattern": "^[a-z0-9-]+$"
        },
        "description": {
          "type": "string",
          "minLength": 1
        },
        "tools": {
          "type": "string"
        },
        "model": {
          "type": "string",
          "enum": ["sonnet", "opus", "haiku", "inherit"]
        }
      }
    }
  }
}
```

### Documentation Sources (`docs/`)

Documentation files include:
- Full YAML frontmatter for validation
- Mustache templates for dynamic content
- Rich markdown content for human readers

Example:
```markdown
---
schema: agent
name: code-reviewer
description: Expert code reviewer...
tools: Read, Grep, Glob
model: sonnet
---

# {{name}} Agent

## Description
{{description}}

## Configuration
- **Tools**: {{tools}}
- **Model**: {{model}}

[Rest of documentation...]
```

## Usage

### 1. In Claude Code

Simply place the `.claude` folder in your project root:

```bash
# Claude automatically discovers agents and commands
$ claude

# Use agents explicitly
> Use the code-reviewer agent to check my changes

# Or Claude invokes them automatically
> Can you review my authentication code?

# Use slash commands
> /review-pr
> /generate-tests src/user-service.ts
```

### 2. Using the CLI

```bash
# From this directory, validate agents
bun ../../packages/cli/dist/index.js validate docs/agents/

# Build to .claude folder
bun ../../packages/cli/dist/index.js build docs/ --output dist/.claude/

# Build documentation
bun ../../packages/cli/dist/index.js build docs/ --output dist/docs/
```

### 3. Result

The `.claude` folder in `dist/.claude/` is ready to use:
- Agents have only required frontmatter (name, description, tools, model)
- Commands have only Claude Code frontmatter (allowed-tools, description, model)
- All other metadata stays in documentation (`dist/docs/`)

## Example Agents

### Code Reviewer (`code-reviewer`)

**Purpose**: Reviews code for bugs, security issues, and best practices

**Tools**: Read, Grep, Glob

**When used**: After code changes, security reviews, PR reviews

### Test Generator (`test-generator`)

**Purpose**: Generates comprehensive unit and integration tests

**Tools**: Read, Write, Edit, Bash

**When used**: Creating tests, improving coverage, TDD workflows

## Example Commands

### `/review-pr`

Comprehensive PR review including:
- Code quality analysis
- Security check
- Test coverage verification
- Documentation review

### `/generate-tests <file-path>`

Generates test suite with:
- Unit tests for all functions
- Edge cases and error scenarios
- 90%+ coverage goal
- AAA pattern

## Benefits

### For Teams

- **Consistency**: Standardized agent configurations
- **Sharing**: Commit `.claude` to git, share with team
- **Quality**: Schema validation prevents configuration errors
- **Documentation**: Auto-generated docs from single source

### For Projects

- **Reusability**: Same agents across projects
- **Customization**: Project-specific agents override user agents
- **Maintenance**: Easy to update and version control
- **Discoverability**: Documentation makes agents/commands easy to find

## See Also

- [Claude Code Sub-agents Documentation](https://docs.claude.com/en/docs/claude-code/sub-agents)
- [Claude Code Slash Commands](https://docs.claude.com/en/docs/claude-code/slash-commands)
- [markdown-di Core Package](../../packages/core)
- [markdown-di CLI](../../packages/cli)
