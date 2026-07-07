import type { BunPlugin } from 'bun'
import { collectSources, createRenderer } from './render'

/**
 * Bun loader: importing a `.md` (or `.markdown`) file yields a module whose
 * default export is a strict render function, plus `frontmatter` and `source`
 * named exports. The file's own directory is the base for partial resolution.
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
      const { render, frontmatter, source } = createRenderer(args.path)
      return {
        loader: 'object',
        exports: {
          default: render,
          frontmatter,
          source,
        },
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
 * binary. Same public shape as the runtime loader (default / frontmatter / source).
 *
 *     await Bun.build({ entrypoints, plugins: [markdownDiBundleLoader], compile: {...} })
 */
export const markdownDiBundleLoader: BunPlugin = {
  name: '@markdown-di/bun/bundle',
  setup(build) {
    build.onLoad({ filter: /\.(md|markdown)$/ }, (args) => {
      const snapshot = collectSources(args.path)
      const contents = [
        `import { createRendererFromSnapshot as __fromSnapshot } from '@markdown-di/bun'`,
        `const __renderer = __fromSnapshot(${JSON.stringify(snapshot)})`,
        `export default __renderer.render`,
        `export const frontmatter = __renderer.frontmatter`,
        `export const source = __renderer.source`,
      ].join('\n')
      return { loader: 'js', contents }
    })
  },
}
