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

A file can also declare itself **data** (`export: data`) and import as a typed object —
`{ frontmatter, keyLines, body, sections }` — or be a **collection** manifest (`export: collection`)
that imports every data file under a folder as one typed array. See
[Data imports](#data-imports-export-data) and [Collections](#collections-export-collection).

The same import semantics are available in Vite via [`@markdown-di/vite`](../vite); both
are built on the shared engine in `@markdown-di/core/modules`.

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

What a `.md` file imports as is declared by its `export:` frontmatter key — `render`
(the default), `data` or `collection`. Importing a template (`x.md`) yields:

| export | value |
| --- | --- |
| `default` | `(params?) => string` — the strict render function (output is trimmed, frontmatter is not included) |
| `frontmatter` | the file's parsed frontmatter (including the `params:` block) |
| `source` | the raw file contents |

## Data imports (`export: data`)

Not every markdown file is a template. A file that declares `export: data` imports as a
plain, typed object — YAML frontmatter for structure, the markdown body for copy, no
rendering:

```markdown
---
export: data
id: g-brief
kind: gate
roles: [product-lead, designer]
routes:
  - id: hardened
    text: hardened → backlog
---

# framed

_Gate · mandatory · kill gate_

The product lead decides on the pressure-tested PR-FAQ.

- **Decides:** product-lead
- **Killed:** epic → Stopped

## DACI

- **Driver:** product-lead
- **Approvers:** product-lead, designer
```

```ts
import framed from './process/framed.gate.md'

framed.frontmatter.id            // "g-brief" — typed as the literal, see Typed imports
framed.sections.title            // "framed"
framed.sections.category         // "Gate · mandatory · kill gate"
framed.sections.rows             // [{ label: 'Decides', text: 'product-lead', line: 17 }, …]
framed.sections.sections[0].rows // the DACI rows
```

| export | value |
| --- | --- |
| `default` | `{ frontmatter, keyLines, body, sections }` |
| `frontmatter` | the parsed frontmatter, **without** the `export` key |
| `keyLines` | the 1-based source line of each top-level frontmatter key, for positional errors |
| `body` | the markdown after the frontmatter, trimmed |
| `sections` | the body split by headings (below) |

### `sections`

A small, line-based split — enough to drive a card face or an info panel from prose,
without a markdown AST:

```ts
interface MarkdownSections extends MarkdownBlock {
  title: string | null           // the first `# ` heading
  sections: MarkdownSection[]    // every `## ` heading, in order
}
interface MarkdownSection extends MarkdownBlock {
  heading: string                // text after `## `
  line: number                   // 1-based source line of the heading
}
interface MarkdownBlock {        // the preamble under the title, and each `## ` section
  category: string | null        // the italic tagline: `_…_` or `*…*`, markers stripped
  paragraphs: string[]           // remaining paragraphs, raw markdown
  rows: MarkdownRow[]            // `- **Label:** text` list items
  content: string                // the block's raw markdown, trimmed
}
interface MarkdownRow {
  label: string                  // without the colon (`**Label:**` or `**Label**:`)
  text: string                   // continuation lines joined with `\n`
  line: number                   // 1-based source line
}
```

- **Rows** come from lists whose items are *all* `- **Label:** text` (`*`/`+` bullets
  too). A list with any other item stays a paragraph.
- **Category** is the first paragraph that is a single italic span, when it precedes any
  other prose or list in its block — a bold-only line may come first (e.g.
  `**Status: A → B**` then `_Effect · …_`).
- `###` and deeper headings stay inside their `## ` section's content. Fenced code blocks
  are opaque: no headings, rows or paragraph breaks are found inside them.
- Line numbers point into the original file (frontmatter included), so a validator built
  on top can report `file:line`.

### Strictness

Data is held to the same standard as templates. These fail the import (and a
`bun build`) with a `RenderError` whose message ends in `(file:line)`:

- malformed YAML frontmatter — `invalid YAML frontmatter: … (process/framed.gate.md:7)`
- duplicate frontmatter keys — `Map keys must be unique (…:5)`
- a non-mapping frontmatter root, or a non-YAML frontmatter language
- an unknown `export:` value — `` `export` must be one of render | data | collection ``

## Collections (`export: collection`)

To import every data file under a folder, put a **manifest** next to them — a markdown
file that declares `export: collection` and which files it collects:

```markdown
---
export: collection
include: "**/*.md"          # a glob or a list of globs, relative to this file
exclude: [README.md]        # optional
---

Every card of the process. (The body is free-form documentation; it is not imported.)
```

```ts
import cards from './process/process.md'

for (const card of cards) {
  card.path            // "02-frame/framed.gate.md" — relative to the manifest
  card.frontmatter     // as in a data import
  card.sections
}

type CardId = (typeof cards)[number]['frontmatter']['id'] // a union of literal ids
```

- The default export is an array of `{ path, frontmatter, keyLines, body, sections }`, sorted by
  path. The manifest never includes itself.
- Membership is the opt-in: matched files load as data whether or not they declare
  `export: data`. A matched file that declares a *different* kind fails loudly.
- Patterns are jailed to the manifest's directory (no `..`, no absolute paths), like
  partials. A manifest takes only `include` / `exclude`; any other key is an error, and
  so is a collection that matches no files.

**Why a manifest file instead of a glob in the import specifier**
(`'./process/**/*.md?glob'`)? It is the one design that is typed, portable and explicit
at once:

- *Typed.* TypeScript can't declare a module for a glob specifier: ambient module
  patterns allow a single `*` and no relative names, so `'./process/**/*.md?glob'` can
  never be typed by a declaration file. A manifest is an ordinary `.md` import, so
  typegen gives it a precise tuple type (single-file *and* sibling mode).
- *Portable.* Bun's runtime plugins don't see unresolvable specifiers, and Vite's
  `import.meta.glob` is Vite-only; a manifest is a plain file load in both, through the
  same `onLoad` / `load` hook as every other `.md` import.
- *Explicit.* The glob lives in one reviewable place next to the files it collects,
  with room for `exclude` and for prose explaining the collection.

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

Data files and collections get **literal** types — the frontmatter typed as if written
`as const` (string/number/boolean literals, readonly tuples, readonly objects) — so
unions derive straight from the files:

```ts
// process/process.d.md.ts (generated, abridged)
declare const entries: readonly [
  {
    readonly path: "02-frame/framed.gate.md"
    readonly frontmatter: {
      readonly id: "g-brief"
      readonly kind: "gate"
      readonly roles: readonly ["product-lead", "designer"]
      // …
    }
    readonly keyLines: { readonly [key: string]: number }
    readonly body: string
    readonly sections: MarkdownSections
  },
  // …one entry per member
]
export default entries
```

```ts
type CardId = (typeof cards)[number]['frontmatter']['id'] // "g-brief" | "n-classify" | …
```

The `MarkdownSections` interfaces are written into the generated file itself (in
single-file mode once, as an ambient `'markdown-di:types'` module), so the declarations
depend on no installed package. Re-run typegen whenever the data changes — the literal
types *are* the data.

For files without a generated declaration, reference the ambient fallback once (files
with a sibling `.d.md.ts` still win):

```ts
/// <reference types="@markdown-di/bun/md-modules" />
```

which types any `*.md` import as `(params?: Record<string, unknown>) => string`.

### Single-file mode

With many prompts, one sibling `.d.md.ts` per template clutters the tree. `--single-file`
emits **one** declaration file instead, containing a wildcard ambient module block per
template:

```sh
bunx markdown-di-typegen "prompts/**/*.md" --single-file types/prompts.d.ts
```

```ts
// types/prompts.d.ts (generated)
declare module '*compile-brief.md' {
  export interface CompileBriefParams {
    transcript: string
    productName: string
    attempt?: number
  }

  const render: (params: CompileBriefParams) => string
  export default render

  export const frontmatter: Record<string, unknown>
  export const source: string
}
```

The blocks match import specifiers by filename (`./prompts/compile-brief.md` matches
`'*compile-brief.md'`), so no sibling files and no `allowArbitraryExtensions` — the one
file just needs to be inside your tsconfig's `include`. Prefer it when a growing prompt
directory makes generated siblings obnoxious; prefer sibling mode when basenames aren't
under your control.

Because matching is by filename, single-file mode enforces two constraints and fails
loudly (listing the offenders) when they're violated:

- **Basenames must be unique** across the globbed templates — `a/compile.md` and
  `b/compile.md` would both match `'*compile.md'`.
- **No basename may be a proper suffix of another** — an import of `./self-narrate.md`
  also matches `'*narrate.md'`.

Two caveats:

- **Stale siblings shadow the single file.** TypeScript prefers a resolved sibling
  `.d.md.ts` over ambient wildcard modules, so a leftover sibling from an earlier
  sibling-mode run silently overrides the single file with possibly stale types. Typegen
  warns and lists them; delete them when switching modes.
- **Don't combine with the `md-modules` reference — use `--include-fallback` instead.**
  Ambient wildcard ties (`'*narrate.md'` vs `'*.md'`) are broken by declaration order,
  so a separately loaded generic fallback can shadow the per-template blocks.
  `--include-fallback` appends the generic `*.md` / `*.markdown` blocks *after* the
  per-template blocks in the same file, where they safely lose the tie.

Typegen is also available programmatically:

```ts
import { typegen } from '@markdown-di/bun'

typegen('prompts/**/*.md', { cwd: import.meta.dir })

// Single-file mode, with the generic fallback appended:
typegen('prompts/**/*.md', {
  cwd: import.meta.dir,
  singleFile: 'types/prompts.d.ts',
  includeFallback: true,
})
```

## Programmatic rendering

The loader is a thin wrapper over `createRenderer`, which you can use directly:

```ts
import { createRenderer } from '@markdown-di/bun'

const { render, frontmatter, params } = createRenderer('prompts/compile-brief.md')
render({ transcript: '…', productName: 'Jig' })
```

## Bundling and standalone binaries (`bun build`)

The default `markdownDiLoader` uses Bun's `object` loader — it returns a live render
**function**, which is perfect for `bun run` / `bun test` but **cannot be bundled**: a
bundler can't serialize a function, so under `bun build` (and `bun build --compile`)
the export silently collapses to a plain object and calling it throws
`… is not a function` at runtime.

For `bun build`, use **`markdownDiBundleLoader`** instead. It captures each template
and every partial it reaches into a self-contained snapshot at build time and emits
real JS that rebuilds the render function from that snapshot — no filesystem, no
preload, no cwd dependence. It works in a `--compile` standalone binary and keeps the
same exports (`default` / `frontmatter` / `source`) and strict rendering semantics.
Data and collection imports bundle as plain object / array literals — no runtime helper
at all.

```ts
// build.ts — note: run this WITHOUT the runtime plugin preloaded, so only the
// bundle loader handles .md (a preloaded markdownDiLoader would compete for it).
import { markdownDiBundleLoader } from '@markdown-di/bun'

await Bun.build({
  entrypoints: ['./src/cli.ts'],
  plugins: [markdownDiBundleLoader],
  compile: { outfile: 'dist/app' }, // omit `compile` for a plain JS bundle
})
```

The building blocks are also exported directly: `collectSources(path)` returns a
`TemplateSnapshot`, and `createRendererFromSnapshot(snapshot)` turns one back into a
`Renderer` — the same pair the bundle loader wires together.

## Semantics and caveats

- Rendering mirrors `@markdown-di/core`'s processor (partials, nested partials, glob
  patterns, `$parent` scoping, unescaped output) and is pinned against core by parity
  tests — but it is a separate, synchronous engine (`@markdown-di/core/modules`, shared
  with `@markdown-di/vite`), so `render()` returns a `string`, not a `Promise`.
- Output is the rendered **body only** (trimmed); frontmatter and core's
  `output-frontmatter` reassembly are a build-pipeline concern and don't apply here.
- Files without frontmatter import verbatim and declare no params.
- `export` is a reserved frontmatter key: it can't be a param name, and data imports
  strip it from `frontmatter`.
- Custom mustache delimiters and core's `onBeforeCompile`/`variants`/schema-validation
  hooks are not supported through the loader; use core's APIs for build pipelines.
- Bun-only: the loader uses `Bun.plugin`. For `bun run` / `bun test`, preload
  `markdownDiLoader` (via `@markdown-di/bun/plugin`); for `bun build`, use
  `markdownDiBundleLoader` (see [Bundling](#bundling-and-standalone-binaries-bun-build)).
