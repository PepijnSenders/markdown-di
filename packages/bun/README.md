# @markdown-di/bun

Bundler-style imports for [markdown-di](https://github.com/PepijnSenders/markdown-di) files
in the Bun runtime: importing a `.md` file gives you a **typed, strict, synchronous render
function** — the way webpack loaders turn CSS into modules, but for frontmatter-driven
markdown templates.

```ts
import compileBrief from './prompts/compile-brief.md'

// compileBrief is a typed render function; its params come from the file's frontmatter.
const prompt = compileBrief({ transcript })
```

Built for runtime template consumers — e.g. a Bun-run TypeScript CLI that keeps its LLM
prompts as `.md` files with frontmatter and renders them at the moment of use — as a
replacement for core's build-oriented `BatchProcessor`.

## Setup

```sh
bun add @markdown-di/bun
```

Register the loader in `bunfig.toml` so every `.md` / `.markdown` import goes through it
(this also applies under `bun test`):

```toml
preload = ["@markdown-di/bun/plugin"]
```

## Declaring params

A prompt file declares its render-time inputs in a `params:` frontmatter block —
`name: type`, with a `?` suffix for optional params. The type vocabulary is deliberately
small: `string`, `number`, `boolean`, `string[]`, `number[]`, `boolean[]`.

```markdown
---
name: compile-brief
description: Compile a product brief from an interview transcript
params:
  transcript: string
  productName: string
  attempt?: number
partials:
  guidelines: partials/guidelines.md
---

# Compile a brief for {{productName}}

{{partials.guidelines}}

## Transcript

{{transcript}}

{{#attempt}}
This is attempt {{attempt}} — address the gaps flagged in the previous review.
{{/attempt}}
```

Core's `$dynamic` marker also works (`transcript: $dynamic` declares a required, untyped
param), but the `params:` block is preferred: it reads as a signature at the top of the
prompt and carries types for codegen.

Everything else is standard markdown-di: params and frontmatter data fields are one
mustache view, partials transclude with `{{partials.key}}` (globs supported), and partial
frontmatter can reach the parent scope with `$parent` / `$parent('key')`. Partial paths
resolve against the imported file's directory.

## Shared partials root

Relative partial paths are jailed to the importing file's directory — `..` traversal is
rejected by design, so sibling template folders can't reach a common fragment. For
fragments shared across folders, declare a **partials root** in a `.markdown-di.json`
placed at (or above) your templates, and reference it with a `~/` prefix:

```json
{ "partialsRoot": "src/prompts/partials" }
```

```markdown
---
partials:
  guidelines: ~/guidelines.md
  snippets: ~/snippets/*.md
---
```

Resolution rules:

- The config is discovered by walking up from the imported file's directory; the
  **nearest** `.markdown-di.json` wins and is a boundary — if it declares no
  `partialsRoot`, `~/` paths are an error (`invalid-declaration`), never a fall-through
  to an outer config.
- `partialsRoot` resolves relative to the config file's own directory.
- The root is a jail like the file-local base: `~/../x` and absolute paths are rejected.
- Globs work under the root; rendering semantics ($parent scoping, nesting, strictness)
  are identical to file-local partials. A shared partial may itself declare `~/`
  partials — the root, like the relative base, is anchored at the entry file.
- A malformed config or a non-string `partialsRoot` fails loudly.

## Strict rendering

The render function **throws** (a `RenderError` with a `code`) instead of ever producing
a silently-empty tag:

| violation | code |
| --- | --- |
| param passed that is not declared in frontmatter | `unknown-param` |
| declared required param missing | `missing-param` |
| param value doesn't match its declared type | `wrong-type` |
| any `{{tag}}` in the body **or a transcluded partial** that resolves to nothing (undeclared, `null`/`undefined`, or a blank string) | `unresolved-tag` |
| `$parent` reference the parent scope can't satisfy | `unresolved-tag` |
| native mustache partial `{{> x}}` | `unsupported-tag` |
| partial path that matches no file | `partial-not-found` |
| circular partial inclusion | `circular-partial` |

Sections are the escape hatch for optional data: `{{#attempt}}…{{/attempt}}` over an
absent optional param renders nothing *by design* and is allowed; a bare `{{attempt}}`
interpolation of that absent param throws. Section and inverted-section names must still
be declared — a typo in `{{#atempt}}` throws rather than silently skipping the block.

The same escape hatch extends through transclusion: a partial whose blank render comes
from its own conditional sections (e.g. its whole body is `{{#note}}…{{/note}}`) may be
transcluded while blank — that is control flow, not a silent bug. A **statically** empty
partial file still throws `unresolved-tag` when transcluded.

Checks run against the mustache parse tree (`Mustache.parse`) before rendering, with
mustache's own context-stack lookup semantics, so array/object sections are verified per
element.

## Module shape

Importing `x.md` yields:

| export | value |
| --- | --- |
| `default` | `(params?) => string` — the strict render function (output is trimmed, frontmatter is not included) |
| `frontmatter` | the file's parsed frontmatter (including the `params:` block) |
| `source` | the raw file contents |

## Typed imports

Bun plugins can't teach `tsc` types, so ship declarations with typegen — like
typed-css-modules, it emits a sibling declaration per file (`compile-brief.d.md.ts` for
`compile-brief.md`):

```sh
bunx markdown-di-typegen "prompts/**/*.md"
```

```ts
// prompts/compile-brief.d.md.ts (generated)
export interface CompileBriefParams {
  transcript: string
  productName: string
  attempt?: number
}

declare function render(params: CompileBriefParams): string
export default render

export declare const frontmatter: Record<string, unknown>
export declare const source: string
```

TypeScript picks these up with `"allowArbitraryExtensions": true` in the consumer's
tsconfig. `$dynamic` params are typed `unknown`; files with only optional params get an
optional `params?` argument; files with none get `render(): string`.

For files without a generated declaration, reference the ambient fallback once (files
with a sibling `.d.md.ts` still win):

```ts
/// <reference types="@markdown-di/bun/md-modules" />
```

which types any `*.md` import as `(params?: Record<string, unknown>) => string`.

Typegen is also available programmatically:

```ts
import { typegen } from '@markdown-di/bun'

typegen('prompts/**/*.md', { cwd: import.meta.dir })
```

## Programmatic rendering

The loader is a thin wrapper over `createRenderer`, which you can use directly:

```ts
import { createRenderer } from '@markdown-di/bun'

const { render, frontmatter, params } = createRenderer('prompts/compile-brief.md')
render({ transcript: '…', productName: 'Jig' })
```

## Semantics and caveats

- Rendering mirrors `@markdown-di/core`'s processor (partials, nested partials, glob
  patterns, `$parent` scoping, unescaped output) and is pinned against core by parity
  tests — but it is implemented here, synchronously, so `render()` returns a `string`,
  not a `Promise`.
- Output is the rendered **body only** (trimmed); frontmatter and core's
  `output-frontmatter` reassembly are a build-pipeline concern and don't apply here.
- Files without frontmatter import verbatim and declare no params.
- Custom mustache delimiters and core's `onBeforeCompile`/`variants`/schema-validation
  hooks are not supported through the loader; use core's APIs for build pipelines.
- Bun-only: the loader uses `Bun.plugin`. When bundling with `bun build`, register the
  plugin (`markdownDiLoader`) in your build script.
