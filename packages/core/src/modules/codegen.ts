import { loadModule, type ModuleKind } from './module'
import { collectSources } from './render'
import { rebaseSnapshot, type Sources } from './sources'

export interface EmitOptions {
  /**
   * The module specifier template code imports `createRendererFromSnapshot`
   * from (e.g. `@markdown-di/bun` or `@markdown-di/vite/runtime`). Data and
   * collection modules import nothing.
   */
  runtime: string
  /**
   * Root template snapshots at this directory (`/prompts/x.md` instead of
   * `/home/me/app/prompts/x.md`), so a bundle does not embed the build
   * machine's paths. Files outside it rebase to their nearest common ancestor.
   * Omit to keep absolute paths.
   */
  root?: string
}

export interface EmittedModule {
  kind: ModuleKind
  /** ES module source for the markdown file. */
  code: string
  /** Every file the module was built from — what a bundler should watch. */
  files: string[]
}

/**
 * Compile a markdown file into a self-contained ES module, for bundlers:
 *
 * - a template inlines a snapshot of itself and every partial it reaches, and
 *   rebuilds a strict render function from it at runtime (no filesystem);
 *   exports `default` (render), `frontmatter`, `source`
 * - a data file becomes a plain object literal; exports `default`
 *   (`{ frontmatter, body, sections }`), `frontmatter`, `body`, `sections`
 * - a collection manifest becomes an array literal of its members
 *
 * Every strict-mode problem (bad frontmatter, missing partials, an empty
 * collection) throws here, at build time.
 */
export function emitModule(
  filePath: string,
  sources: Sources,
  options: EmitOptions,
): EmittedModule {
  const loaded = loadModule(filePath, sources)
  switch (loaded.kind) {
    case 'render': {
      const captured = collectSources(loaded.path, sources)
      const snapshot = options.root ? rebaseSnapshot(captured, options.root) : captured
      const code = [
        `import { createRendererFromSnapshot as __fromSnapshot } from ${JSON.stringify(options.runtime)}`,
        `const __renderer = __fromSnapshot(${JSON.stringify(snapshot)})`,
        'export default __renderer.render',
        'export const frontmatter = __renderer.frontmatter',
        'export const source = __renderer.source',
        '',
      ].join('\n')
      return { kind: 'render', code, files: Object.keys(captured.files) }
    }
    case 'data': {
      const code = [
        `const data = ${JSON.stringify(loaded.data)}`,
        'export default data',
        'export const frontmatter = data.frontmatter',
        'export const body = data.body',
        'export const sections = data.sections',
        '',
      ].join('\n')
      return { kind: 'data', code, files: [loaded.path] }
    }
    case 'collection':
      return {
        kind: 'collection',
        code: `export default ${JSON.stringify(loaded.entries)}\n`,
        files: loaded.files,
      }
  }
}
