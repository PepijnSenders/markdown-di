# Personal Notes Organization Example

This example demonstrates how to organize personal notes with markdown-di for validation, consistency, and automatic documentation generation.

## Structure

```
notes/
├── meeting-notes/
│   └── 2025-01-15-sprint-planning.md
├── daily-notes/
│   └── 2025-01-20-daily.md
├── projects/
│   └── auth-redesign-project.md
└── books/
    └── atomic-habits-book.md
```

## Schemas

This example defines four note types:

### Meeting Note
For documenting meetings with:
- Required: title, date, attendees, topics
- Optional: location, project, tags

### Daily Note
For daily journaling with:
- Required: date, mood, focus areas (1-3)
- Optional: energy level (1-10), tags

### Project Note
For tracking projects with:
- Required: title, status, owner, start date
- Optional: end date, priority, links, tags
- Status: planning, in-progress, blocked, completed, archived

### Book Note
For documenting books with:
- Required: title, author, status
- Optional: rating (1-5), dates, genre, tags
- Status: to-read, reading, finished, abandoned

## Usage

### Using the CLI

```bash
# Validate all notes
markdown-di validate notes/

# Build documentation
markdown-di build notes/ --output dist/

# Validate a single note
markdown-di validate notes/2025-01-20-daily.md
```

### Using the Core Package

```typescript
import { MarkdownDI } from '@markdown-di/core'
import { readFileSync } from 'fs'
import path from 'path'

const mdi = new MarkdownDI()

// Load config with auto-discovery
const configPath = path.join(__dirname, '.markdown-di.json')
const config = JSON.parse(readFileSync(configPath, 'utf-8'))

// Register schemas
for (const [name, schema] of Object.entries(config.schemas)) {
  mdi.registerSchema(name, schema)
}

// Process a note
const notePath = 'notes/2025-01-20-daily.md'
const content = readFileSync(notePath, 'utf-8')
const result = await mdi.process({ content })

if (result.errors.length > 0) {
  console.error('Validation errors:', result.errors)
  process.exit(1)
}

// Write output
writeFileSync('dist/2025-01-20-daily.md', result.output)
```

### Batch Processing

```typescript
import { glob } from 'glob'
import { mkdirSync } from 'fs'

// Find all markdown files
const files = await glob('notes/**/*.md')

// Process each file
for (const file of files) {
  const content = readFileSync(file, 'utf-8')
  const result = await mdi.process({ content, baseDir: 'notes' })

  if (result.errors.length > 0) {
    console.error(`❌ ${file}:`)
    result.errors.forEach(err => console.error(`  - ${err.message}`))
    continue
  }

  // Write to dist with same structure
  const outPath = file.replace('notes/', 'dist/')
  mkdirSync(path.dirname(outPath), { recursive: true })
  writeFileSync(outPath, result.output)
  console.log(`✅ ${file}`)
}
```

## Benefits

### Validation
- Ensure required fields are present
- Validate date formats
- Enforce enums for status, mood, priority
- Check array constraints (min/max items)

### Consistency
- Standardized frontmatter across all notes
- Uniform structure for each note type
- Enforced naming conventions

### Documentation
- Auto-generate formatted output from templates
- Handlebars templates in markdown body
- Dynamic content from frontmatter

### Searchability
- Consistent tags and metadata
- Schema-validated fields for querying
- Structured data for indexing

## Example Workflows

### Daily Review
```bash
# Validate today's notes
markdown-di validate notes/$(date +%Y-%m-%d)-daily.md

# Generate weekly summary
markdown-di build notes/daily-notes/ --output reports/weekly/
```

### Project Management
```bash
# Check all project statuses
grep -r "status:" notes/projects/

# Validate project notes
markdown-di validate notes/projects/

# Generate project dashboard
markdown-di build notes/projects/ --output dashboard/
```

### Knowledge Base
```bash
# Build complete knowledge base
markdown-di build notes/ --output knowledge-base/

# Validate book notes
markdown-di validate notes/books/

# Create reading list
grep -r "status: to-read" notes/books/
```

## Output

The `dist/` folder contains processed markdown with:
- Validated and normalized frontmatter
- Rendered Handlebars templates
- Consistent formatting
- Full metadata for indexing
