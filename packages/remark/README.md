# @markdown-di/remark

Remark adapter for markdown-di with AST-based transformations.

## Features

- ✅ Full AST-based transclusion (powered by @markdown-di/core)
- ✅ Heading level adjustments
- ✅ Link rewriting
- ✅ Frontmatter handling
- ✅ Works with unified/remark ecosystem

## Installation

```bash
bun add @markdown-di/remark remark remark-parse remark-stringify remark-frontmatter
```

## Usage

```typescript
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import { remarkMarkdownDI } from '@markdown-di/remark';

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkMarkdownDI, {
    baseDir: './docs',
    headingShift: true,      // Adjust heading levels
    linkRewrite: true,       // Fix relative links
    removeFrontmatter: false // Keep frontmatter in output
  })
  .use(remarkStringify);

const result = await processor.process(myMarkdownString);
console.log(String(result));
```

## Options

### `baseDir` (required)

Base directory for resolving file paths.

```typescript
remarkMarkdownDI({ baseDir: './docs' })
```

### `headingShift` (default: `true`)

Automatically adjust heading levels when transcluding content.

```typescript
// When enabled:
// If you transclude under an H2, the transcluded H1 becomes H3
remarkMarkdownDI({ headingShift: true })
```

### `linkRewrite` (default: `true`)

Rewrite relative links after transclusion to maintain correctness.

```typescript
remarkMarkdownDI({ linkRewrite: true })
```

### `removeFrontmatter` (default: `false`)

Remove dependency declarations from frontmatter in output.

```typescript
// Keep only name/description, remove blueprints/references
remarkMarkdownDI({ removeFrontmatter: true })
```

## How It Works

1. **Parse** - Remark parses markdown to MDAST
2. **Validate** - @markdown-di/core validates frontmatter and references
3. **Resolve** - Core resolves dependencies to file paths
4. **Transclude** - Plugin replaces `{{refs}}` with file contents (as AST nodes)
5. **Transform** - Apply heading shifts and link rewrites
6. **Output** - Remark stringifies back to markdown

## Advanced Usage

### Custom Heading Shift Strategy

```typescript
remarkMarkdownDI({
  baseDir: './docs',
  headingShift: (currentDepth, contextDepth) => {
    // Custom logic
    return currentDepth + contextDepth;
  }
})
```

### Custom Link Rewriter

```typescript
remarkMarkdownDI({
  baseDir: './docs',
  linkRewrite: (url, sourcePath, targetPath) => {
    // Custom logic
    return rewrittenUrl;
  }
})
```

## License

MIT © Pepijn Senders
