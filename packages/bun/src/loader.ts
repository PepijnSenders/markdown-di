import { emitModule, loadModule } from '@markdown-di/core/modules'
import { diskSources } from '@markdown-di/core/modules/node'
import type { BunPlugin } from 'bun'
import { createRenderer } from './render'

/**
 * Bun loader: importing a `.md` (or `.markdown`) file yields the module its
 * frontmatter declares (`export:`):
 *
 * - a template (the default): a strict render function as the default export,
 *   plus `frontmatter` and `source` named exports. The file's own directory is
 *   the base for partial resolution.
 * - `export: data`: `{ frontmatter, keyLines, body, sections }` as the default export,
 *   plus each as a named export.
 * - `export: collection`: an array of every data file the manifest's `include`
 *   globs match, each `{ path, frontmatter, keyLines, body, sections }`.
 *
 * Register it via bunfig.toml so static imports work everywhere:
 *
 *     preload = ["@markdown-di/bun/plugin"]
 *
 * This uses `loader: 'object'`, which returns a live function — great for
 * `bun run` / `bun test`, but the bundler can't serialize a function, so it is
 * NOT suitable for `bun build` / `--compile`. Use markdownDiBundleLoader there.
 */
export const markdownDiLoader: BunPlugin = {
  name: '@markdown-di/bun',
  setup(build) {
    build.onLoad({ filter: /\.(md|markdown)$/ }, (args) => {
      const loaded = loadModule(args.path, diskSources)
      switch (loaded.kind) {
        case 'render': {
          const { render, frontmatter, source } = createRenderer(args.path)
          return { loader: 'object', exports: { default: render, frontmatter, source } }
        }
        case 'data':
          return { loader: 'object', exports: { default: loaded.data, ...loaded.data } }
        case 'collection':
          return { loader: 'object', exports: { default: loaded.entries } }
      }
    })
  },
}

/**
 * Bundle-time loader for `bun build` / `bun build --compile`. Instead of a live
 * function (which the bundler drops to a plain object), it captures the template
 * and every partial it reaches into a snapshot and emits real JS that rebuilds
 * the renderer from that snapshot at runtime — no filesystem, no preload. The
 * default export is a genuine render function that survives into a standalone
 * binary. Same public shape as the runtime loader (default / frontmatter /
 * source). Data and collection modules are emitted as plain object literals.
 *
 *     await Bun.build({ entrypoints, plugins: [markdownDiBundleLoader], compile: {...} })
 */
export const markdownDiBundleLoader: BunPlugin = {
  name: '@markdown-di/bun/bundle',
  setup(build) {
    build.onLoad({ filter: /\.(md|markdown)$/ }, (args) => {
      const { code } = emitModule(args.path, diskSources, { runtime: '@markdown-di/bun' })
      return { loader: 'js', contents: code }
    })
  },
}
