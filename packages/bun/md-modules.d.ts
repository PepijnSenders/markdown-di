// Ambient fallback for markdown modules without a generated sibling declaration.
// Reference it once from your project, e.g. in an env.d.ts:
//
//   /// <reference types="@markdown-di/bun/md-modules" />
//
// or via tsconfig:  "compilerOptions": { "types": ["@markdown-di/bun/md-modules"] }
//
// Files that have a generated `x.d.md.ts` next to them (markdown-di-typegen)
// resolve to that declaration instead and get precise param types.

declare module '*.md' {
  const render: (params?: Record<string, unknown>) => string
  export default render
  export const frontmatter: Record<string, unknown>
  export const source: string
}

declare module '*.markdown' {
  const render: (params?: Record<string, unknown>) => string
  export default render
  export const frontmatter: Record<string, unknown>
  export const source: string
}
