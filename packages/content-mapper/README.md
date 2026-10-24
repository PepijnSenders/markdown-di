# @markdown-di/content-mapper

A [TypeScript 7.1 content mapper](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/)
for [markdown-di](https://github.com/PepijnSenders/markdown-di): `tsc` and the editor type
`.md` imports straight from their frontmatter. No `markdown-di-typegen` step, no generated
`.d.md.ts` or single-file declarations, and no stale types after you edit a prompt.

```md
---
params:
  transcript: string
  attempt?: number
---
Summarize {{transcript}}.
```

```ts
import brief from './brief.md'

brief({ transcript: 'hi' }) // ✅
brief({ transcript: 1 })   // ❌ Type 'number' is not assignable to type 'string'.
brief({})                  // ❌ Property 'transcript' is missing in type '{}' but required in type 'BriefParams'.
```

The types are the ones `markdown-di-typegen` writes, from the same code: a template's render
function from its `params:` block (or `$dynamic` fields), a data file's frontmatter as a literal
type, a collection as a readonly tuple of its members.

The mapper only types imports. At runtime a `.md` import still needs the loader:
[`@markdown-di/bun`](../bun) or [`@markdown-di/vite`](../vite).

## Setup

Requires TypeScript 7.1 or later.

```sh
npm install -D @markdown-di/content-mapper
```

```jsonc
// tsconfig.json
{
  "compilerOptions": { "noEmit": true },
  "contentMappers": [
    { "package": "@markdown-di/content-mapper", "extensions": [".md"] }
  ]
}
```

A content mapper runs code, so `tsc` asks for it explicitly:

```sh
tsc --runExternalCode
```

In VS Code, mappers run in a trusted workspace once you grant content mapper permission.

## In the editor

- **Go to definition** on a param, `brief({ transcript })`, lands on `transcript:` in the
  frontmatter. Hover, find references and highlights follow the same mapping.
- **Frontmatter errors are TypeScript errors in the `.md` file**: malformed YAML, a duplicate
  key or an unsupported param type is reported on its line (`markdown-di1001`,
  `markdown-di1002`, …). The file still imports as an untyped render function, so its
  importers keep checking.
- The mapper reads the editor's unsaved buffer, not the file on disk.

## Limits

- **Collections are as fresh as their manifest.** A collection's type is built from its
  members, but TypeScript re-runs the mapper only when the manifest changes. After you edit a
  member, touch the manifest or reload the project.
- **Types only.** The virtual module holds declarations, so use it in a project that does not
  emit (`noEmit`) or whose bundler loads `.md` files.
- **TypeScript 7.1 is in beta.** The content mapper protocol may still change.
