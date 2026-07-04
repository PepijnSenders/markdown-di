import type { BunPlugin } from 'bun'
import { createRenderer } from './render'

/**
 * Bun loader: importing a `.md` (or `.markdown`) file yields a module whose
 * default export is a strict render function, plus `frontmatter` and `source`
 * named exports. The file's own directory is the base for partial resolution.
 *
 * Register it via bunfig.toml so static imports work everywhere:
 *
 *     preload = ["@markdown-di/bun/plugin"]
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
