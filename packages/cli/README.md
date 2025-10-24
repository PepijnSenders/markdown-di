# @markdown-di/cli

CLI tool for building and validating markdown projects with dependency injection.

## Installation

```bash
# Global installation
bun add -g @markdown-di/cli

# Or use with bunx
bunx @markdown-di/cli
```

## Usage

### Build Command

Build markdown files with dependency injection:

```bash
# Build all markdown files
markdown-di build --input ./src --output ./dist

# Shorter alias
mdi build -i ./src -o ./dist

# Watch mode
mdi build -i ./src -o ./dist --watch

# Custom glob pattern
mdi build -i ./src -o ./dist --pattern "**/*.md"
```

### Validate Command

Validate frontmatter and references without building:

```bash
# Validate all files
markdown-di validate ./src

# Validate specific pattern
mdi validate ./src --pattern "docs/**/*.md"

# JSON output for CI
mdi validate ./src --json
```

### Init Command

Initialize a new markdown-di project:

```bash
# Create example structure
markdown-di init ./my-project

# With template
mdi init ./my-project --template basic
```

## Configuration

Create a `markdown-di.config.js` (or `.ts`, `.json`) in your project root:

```javascript
export default {
  input: './src',
  output: './dist',
  pattern: '**/*.md',

  // Processing options
  headingShift: true,
  linkRewrite: true,
  removeFrontmatter: false,

  // Watch options
  watch: {
    ignored: ['node_modules', '.git'],
    awaitWriteFinish: true
  },

  // Validation
  strict: true, // Fail on warnings

  // Hooks
  onBuildStart: () => console.log('Building...'),
  onBuildEnd: (stats) => console.log('Done!', stats),
  onError: (error) => console.error(error)
};
```

## CLI Options

### `build`

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--input` | `-i` | Input directory | `./src` |
| `--output` | `-o` | Output directory | `./dist` |
| `--pattern` | `-p` | Glob pattern | `**/*.md` |
| `--watch` | `-w` | Watch mode | `false` |
| `--config` | `-c` | Config file path | Auto-detect |
| `--clean` | | Clean output before build | `false` |

### `validate`

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--pattern` | `-p` | Glob pattern | `**/*.md` |
| `--json` | | JSON output | `false` |
| `--strict` | | Fail on warnings | `false` |

### `init`

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--template` | `-t` | Template name | `basic` |
| `--force` | `-f` | Overwrite existing | `false` |

## Examples

### Basic Build

```bash
# Input: src/docs/intro.md
---
name: intro
blueprints:
  sections:
    overview: sections/overview.md
---

{{sections.overview}}

# Run build
mdi build -i ./src -o ./dist

# Output: dist/docs/intro.md (fully composed)
```

### Watch Mode for Development

```bash
# Start watch mode
mdi build -i ./src -o ./dist --watch

# Changes to src/ automatically rebuild
```

### CI/CD Integration

```bash
# Validate in CI
mdi validate ./src --json --strict > validation-report.json

# Build for production
mdi build -i ./src -o ./dist --clean
```

## Exit Codes

- `0` - Success
- `1` - Validation errors
- `2` - Build errors
- `3` - File system errors

## License

MIT © Pepijn Senders
