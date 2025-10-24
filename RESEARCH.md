# Research: Frontmatter-Based Dependency Injection for Markdown

This document explains the research and design decisions behind `markdown-di`.

## The Problem

When building large markdown documentation systems (like agent-based development workflows, API documentation, or content sites), you often face:

1. **Massive duplication** - Same workflows/content repeated across 100+ files
2. **Maintenance nightmare** - Updating shared content requires changes in dozens of places
3. **No validation** - Template substitution fails silently at runtime
4. **Hard to track dependencies** - Can't tell what external content a file uses
5. **Breaking changes** - Renaming files breaks references everywhere

### Real-World Example

In a project with ~150 markdown files managing agent workflows, we found:
- **~4,500 lines of duplication** across files
- **373 `{{...}}` template references** with no validation
- **Manual synchronization** required when updating workflows
- **Frequent errors** from typos in template paths

## Existing Solutions (And Why They Fall Short)

### 1. Template-Level Substitution

```markdown
{{path/to/some/file.md}}
```

**Problems:**
- ❌ No validation until file resolution
- ❌ Path changes require find/replace across files
- ❌ Can't see dependencies at a glance
- ❌ No type safety
- ❌ Hard to test/mock

### 2. Preprocessors (Jekyll, Hugo, etc.)

**Problems:**
- ❌ Framework-specific syntax
- ❌ Tightly coupled to static site generators
- ❌ Can't use with arbitrary markdown tools
- ❌ No standalone validation

### 3. MDX

```jsx
import Intro from './intro.mdx'

<Intro />
```

**Problems:**
- ❌ Requires React/JSX runtime
- ❌ Not just markdown anymore
- ❌ Overkill for simple transclusion
- ❌ Breaks compatibility with standard markdown tools

## The Solution: Frontmatter as Dependency Injection

### Core Idea

Treat frontmatter as a **dependency injection container** - all transclusion references must be declared in frontmatter before use in the document body.

### Example

```markdown
---
name: my-document
description: User onboarding guide

# Declare dependencies upfront
blueprints:
  sections:
    intro: docs/sections/intro.md
    setup: docs/sections/setup.md

references:
  tutorials:
    - docs/tutorials/*.md
---

# User Guide

{{sections.intro}}

## Getting Started

{{sections.setup}}

## Related Tutorials

{{references.tutorials}}
```

### Why This Works

1. **Early Validation** ✅
   - Parse frontmatter → extract dependency declarations
   - Find all `{{...}}` in body → validate against frontmatter
   - Error immediately if reference not declared
   - No runtime surprises

2. **Self-Documenting** ✅
   - Look at frontmatter → see all dependencies
   - Clear separation: declarations vs. usage
   - Easy to understand document structure

3. **Type-Safe** ✅
   - Schema validation for frontmatter structure
   - Reference format validation
   - Path existence checks
   - Circular dependency detection

4. **Refactor-Friendly** ✅
   - Change path once in frontmatter
   - Body references stay semantic (`{{sections.intro}}`)
   - No find/replace needed

5. **Testable** ✅
   - Mock dependencies by swapping frontmatter
   - Unit test documents in isolation
   - No file system coupling

## Design Decisions

### 1. Parser-Agnostic Core

**Decision:** Separate validation logic from AST transformation.

**Rationale:**
- Core DI system doesn't need AST manipulation
- Works with any markdown parser (remark, marked, markdown-it)
- Enables simple string-replacement mode for basic use cases
- Parser-specific features in adapters only

**Architecture:**
```
@markdown-di/core     # Parser-agnostic validation & DI
@markdown-di/remark   # Remark adapter with AST features
@markdown-di/marked   # (Future) Marked adapter
```

### 2. Two Dependency Types

**Decision:** Support both singular references (blueprints) and multi-file references.

```yaml
blueprints:
  group:
    key: single/file.md  # One file

references:
  group:
    - multiple/files/*.md  # Multiple files (globs)
```

**Rationale:**
- Blueprints: Workflows, templates (one specific file)
- References: Standards, examples (many related files)
- Semantic distinction in frontmatter
- Different expansion behavior

### 3. Named Groups

**Decision:** Organize dependencies into named groups.

```yaml
standards:
  code:
    - shared/code-quality/*
  testing:
    - shared/testing/*
```

**Rationale:**
- Selective inclusion (`{{standards.code}}` vs `{{standards.testing}}`)
- Semantic grouping (code vs testing standards)
- Placement control (where standards appear in document)
- Self-documenting (group names convey purpose)

### 4. Short Reference Syntax

**Decision:** Use `{{group.key}}` instead of `{{blueprints.group.key}}`.

**Rationale:**
- Less verbose in document body
- More readable
- Assumes blueprints by default (most common case)
- Can still use full syntax if desired

### 5. Validation-First

**Decision:** Validate before processing.

**Process:**
1. Parse frontmatter
2. Extract dependencies
3. Find all `{{...}}` references
4. **Validate everything** (fail fast)
5. Only then: resolve and transclude

**Rationale:**
- Catch errors early
- Clear error messages
- No partial builds
- Build systems can rely on validation

## Implementation Insights

### Frontmatter Schema

```typescript
interface DocumentFrontmatter {
  // Required
  name: string;
  description: string;

  // Optional: Singular references
  blueprints?: {
    [group: string]: {
      [key: string]: string; // path
    };
  };

  // Optional: Multi-file references
  references?: {
    [group: string]: string[]; // paths (can include globs)
  };
}
```

### Reference Resolution

```typescript
// Reference: {{sections.intro}}
// Resolution:
1. Parse ref → group="sections", key="intro"
2. Look up in frontmatter.blueprints.sections.intro
3. Get path: "docs/sections/intro.md"
4. Load file content
5. Replace {{sections.intro}} with content
```

### Glob Expansion

```typescript
// Reference: {{references.tutorials}}
// Resolution:
1. Parse ref → type="references", group="tutorials"
2. Look up frontmatter.references.tutorials
3. Get paths: ["docs/tutorials/*.md"]
4. Expand glob → ["docs/tutorials/a.md", "docs/tutorials/b.md"]
5. Load all files
6. Concatenate content
7. Replace {{references.tutorials}} with concatenated content
```

## Benefits Realized

From implementing this in a real project:

### Quantitative
- **60-70% duplication reduction** (from ~4,500 lines)
- **149 files → ~80 source files**
- **100% validation coverage** (373 references validated)
- **Build time <10s** (full), **<3s** (incremental)

### Qualitative
- **Single source of truth** - Update once, propagates everywhere
- **Safe refactoring** - Validation catches broken references
- **Clear dependencies** - Frontmatter documents all imports
- **Easy onboarding** - New developers understand structure quickly
- **Maintainable at scale** - System stays manageable as content grows

## Future Directions

### Planned Features
- [ ] Section references (`{{file.md#section}}`)
- [ ] Variable interpolation (`{{vars.version}}`)
- [ ] Conditional inclusion
- [ ] Content transformations (filters/pipes)
- [ ] VS Code extension (intellisense, validation)

### Potential Adapters
- [ ] `@markdown-di/marked` - Marked.js adapter
- [ ] `@markdown-di/markdown-it` - markdown-it adapter
- [ ] `@markdown-di/mdx` - MDX integration

## Inspiration

This pattern emerged from building agent-based development workflows with ~150 markdown files. The system needed to be:
- **Type-safe** - Catch errors at build time
- **Maintainable** - Single source of truth
- **Flexible** - Work with any markdown tool
- **Fast** - Build in seconds, not minutes

The frontmatter DI pattern solves all of these requirements elegantly.

## Related Work

- **Django templates** - Inspired the extends/block pattern
- **Angular DI** - Inspired the dependency declaration approach
- **Webpack** - Inspired the module resolution system
- **React imports** - Inspired the semantic reference syntax

## Conclusion

Frontmatter-based dependency injection brings the benefits of modern DI systems to markdown:
- Type safety
- Early validation
- Clear dependencies
- Refactor-friendly
- Testable

The parser-agnostic architecture ensures it works with any markdown ecosystem, making it a universal solution for composable documentation.

---

**Last Updated:** 2025-01-24
