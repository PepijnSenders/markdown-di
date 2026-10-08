# @markdown-di/vite

Vite plugin for [markdown-di](https://github.com/PepijnSenders/markdown-di): import `.md`
files in a Vite app with the same semantics as the Bun loader
([`@markdown-di/bun`](../bun)) — in `vite dev` and `vite build`, in the browser.

```ts
import compileBrief from './prompts/compile-brief.md' // a strict, typed render function
import framed from './process/02-frame/framed.gate.md' // export: data → { frontmatter, keyLines, body, sections }
import cards from './process/process.md' // export: collection → every card, as one array

const prompt = compileBrief({ transcript })
type CardId = (typeof cards)[number]['frontmatter']['id']
```

## Setup

```sh
bun add -d @markdown-di/vite     # or npm / pnpm
```

```ts
// vite.config.ts
import markdownDi from '@markdown-di/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [markdownDi()],
})
```

Requires Vite 5 or later; the test suite runs against Vite 8.

## What an import yields

A file's frontmatter `export:` key declares what it imports as. The shapes, strictness
rules and the `sections` structure are identical to the Bun loader — see the
[`@markdown-di/bun` README](../bun#module-shape) for the full reference.

| `export:` | default export | named exports |
| --- | --- | --- |
| *(absent)* / `render` | `(params?) => string` — a strict render function | `frontmatter`, `source` |
| `data` | `{ frontmatter, keyLines, body, sections }` | `frontmatter`, `keyLines`, `body`, `sections` |
| `collection` | `Array<{ path, frontmatter, keyLines, body, sections }>` — every file the manifest's `include` globs match | — |

How each compiles:

- **Templates** inline a snapshot of the template and every partial it reaches (globs and
  `~/` shared roots included) and rebuild the render function from it at runtime, via
  `@markdown-di/vite/runtime`. Rendering needs no filesystem, so it runs in the browser;
  strict errors (`missing-param`, `unresolved-tag`, …) throw there as they do in Bun.
  Snapshot paths are rooted at the Vite root (`/prompts/x.md`), so bundles don't embed
  your machine's directory layout.
- **Data and collections** compile to plain object / array literals: no runtime code, no
  parser in the bundle.

Strict problems found while compiling — malformed YAML, duplicate keys, a missing
partial, an unknown `export:` value, an empty collection — fail `vite build` (and show in
the dev overlay) with `file:line`.

## Dev server

- Editing a `.md` file, a partial a template transcludes, or a collection member
  recompiles every module built from it.
- Adding or removing a file under a collection's directory recompiles that collection
  (and reloads the page).
- Files outside the Vite root (e.g. a shared `process/` folder in a monorepo) are watched
  too.

Query imports the plugin doesn't own are left to Vite — `import raw from './x.md?raw'`
still gives you the file as a string.

## Types

Generate declarations with `markdown-di-typegen` from `@markdown-di/bun` (it runs on Bun):

```sh
bunx markdown-di-typegen "src/**/*.md" "process/process.md" --single-file src/markdown.gen.d.ts
```

Templates get typed params; data files and collections get **literal** frontmatter types,
so unions like `(typeof cards)[number]['frontmatter']['id']` derive from the files. For
untyped `.md` imports, reference the ambient fallback:

```ts
/// <reference types="@markdown-di/vite/md-modules" />
```

## Options

```ts
markdownDi({
  include: /\.(md|markdown)$/, // which module ids to compile
  runtime: '@markdown-di/vite/runtime', // what template modules import the renderer from
})
```

## How it relates to the other packages

- `@markdown-di/core/modules` — the browser-safe engine (frontmatter parsing, strict
  renderer, data/sections parser, collections, code generation). Both the Bun loader and
  this plugin are thin adapters over it, so a `.md` import behaves the same in each.
- `@markdown-di/bun` — the Bun runtime / `bun build` loader, and `markdown-di-typegen`.
