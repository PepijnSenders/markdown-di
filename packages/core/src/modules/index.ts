/**
 * `@markdown-di/core/modules` — the engine behind importing `.md` files as ES
 * modules, shared by @markdown-di/bun and @markdown-di/vite.
 *
 * Browser-safe: nothing here touches `node:*`, `fs` or `Buffer`. Every file
 * access goes through a `Sources` (see `@markdown-di/core/modules/node` for the
 * disk implementation), so the same code renders from disk in Bun and from an
 * inlined snapshot in a browser bundle.
 */
export { type EmitOptions, type EmittedModule, emitModule } from './codegen'
export { RenderError, type RenderErrorCode } from './errors'
export { type ExtractedDocument, parseFrontmatter } from './frontmatter'
export {
  type CollectionDeclaration,
  type CollectionEntry,
  type DataModule,
  loadModule,
  type MarkdownModule,
  type ModuleKind,
  moduleKind,
} from './module'
export { type ParamSpec, type ParamType, parseParamSpecs, validateArgs } from './params'
export {
  collectSources,
  createRenderer,
  createRendererFromSnapshot,
  type Renderer,
  type RenderFunction,
} from './render'
export {
  type MarkdownBlock,
  type MarkdownRow,
  type MarkdownSection,
  type MarkdownSections,
  parseSections,
} from './sections'
export {
  rebaseSnapshot,
  recordingSources,
  type Sources,
  snapshotSources,
  type TemplateSnapshot,
} from './sources'
