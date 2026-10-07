import { dirname } from 'node:path'
import { emitModule } from '@markdown-di/core/modules'
import { diskSources } from '@markdown-di/core/modules/node'
import type { ModuleNode, Plugin, ViteDevServer } from 'vite'

export interface MarkdownDiOptions {
  /** Which module ids the plugin compiles. @default /\.(md|markdown)$/ */
  include?: RegExp
  /**
   * Module specifier generated template modules import the renderer from.
   * Override only if `@markdown-di/vite` is not resolvable from your markdown
   * files. @default '@markdown-di/vite/runtime'
   */
  runtime?: string
}

const DEFAULT_RUNTIME = '@markdown-di/vite/runtime'

/** Queries Vite itself adds to module ids; any other query (`?raw`, `?url`) is not ours. */
const PASSTHROUGH_QUERIES: ReadonlySet<string> = new Set(['import', 't', 'v'])

/**
 * Vite plugin: import `.md` files with the same semantics as the Bun loader
 * (@markdown-di/bun), in dev and in build. What a file imports as is declared
 * by its frontmatter `export:` key:
 *
 * - a template (the default) — a strict render function as the default export,
 *   plus `frontmatter` and `source`. The template and every partial it reaches
 *   are inlined as a snapshot, so rendering needs no filesystem (works in the
 *   browser).
 * - `export: data` — `{ frontmatter, body, sections }`, plus each as a named
 *   export. Compiled to a plain object literal: no runtime code at all.
 * - `export: collection` — an array of every data file the manifest's
 *   `include` globs match.
 *
 * Strict-mode problems (malformed frontmatter, missing partials, an empty
 * collection) fail the build — or show in the dev overlay — with file:line.
 *
 *     // vite.config.ts
 *     import markdownDi from '@markdown-di/vite'
 *     export default defineConfig({ plugins: [markdownDi()] })
 */
export default function markdownDi(options: MarkdownDiOptions = {}): Plugin {
  const include = options.include ?? /\.(md|markdown)$/
  const runtime = options.runtime ?? DEFAULT_RUNTIME

  // Dev bookkeeping: which compiled modules each source file feeds (partials,
  // collection members), and the directory each collection globs.
  const dependents = new Map<string, Set<string>>()
  const collectionDirs = new Map<string, string>()
  let server: ViteDevServer | undefined
  let root: string | undefined

  const track = (id: string, files: string[]) => {
    for (const set of dependents.values()) set.delete(id)
    for (const file of files) {
      const set = dependents.get(file) ?? new Set()
      set.add(id)
      dependents.set(file, set)
    }
  }

  const invalidate = (ids: Iterable<string>): ModuleNode[] => {
    const modules: ModuleNode[] = []
    if (!server) return modules
    for (const id of ids) {
      const module = server.moduleGraph.getModuleById(id)
      if (!module) continue
      server.moduleGraph.invalidateModule(module)
      modules.push(module)
    }
    return modules
  }

  return {
    name: '@markdown-di/vite',
    enforce: 'pre',

    configResolved(config) {
      root = config.root
    },

    configureServer(devServer) {
      server = devServer
      // A file added to (or removed from) a collection's directory can change
      // its membership: recompile every collection that globs that directory.
      const onMembershipChange = (file: string) => {
        if (!include.test(file)) return
        const affected = [...collectionDirs]
          .filter(([, dir]) => file.startsWith(`${dir}/`))
          .map(([id]) => id)
        if (invalidate(affected).length > 0) devServer.ws.send({ type: 'full-reload' })
      }
      devServer.watcher.on('add', onMembershipChange)
      devServer.watcher.on('unlink', onMembershipChange)
    },

    load(id) {
      const file = markdownFile(id, include)
      if (file === null) return null

      // Snapshots are rooted at the project root: no machine paths in the bundle.
      const emitted = emitModule(file, diskSources, { runtime, root })
      for (const watched of emitted.files) {
        if (watched !== file) this.addWatchFile(watched)
      }
      track(file, emitted.files)
      if (emitted.kind === 'collection') {
        const dir = dirname(file)
        collectionDirs.set(file, dir)
        server?.watcher.add(dir)
      } else {
        collectionDirs.delete(file)
      }

      // `moduleType` tells Rolldown-based Vite the emitted code is JS (the
      // extension says otherwise); Rollup-based Vite ignores it.
      return { code: emitted.code, map: null, moduleType: 'js' }
    },

    // An edited partial or collection member is not itself a module; hand Vite
    // the markdown modules compiled from it so they recompile and propagate.
    handleHotUpdate({ file, modules }) {
      const ids = dependents.get(file)
      if (!ids) return
      const extra = invalidate([...ids].filter((id) => id !== file))
      if (extra.length === 0) return
      return [...modules, ...extra]
    },
  }
}

/** The markdown file an id points at, or null when the plugin should not handle it. */
function markdownFile(id: string, include: RegExp): string | null {
  if (id.startsWith('\0')) return null
  const queryStart = id.indexOf('?')
  const file = queryStart === -1 ? id : id.slice(0, queryStart)
  if (!include.test(file)) return null
  if (queryStart !== -1) {
    for (const key of new URLSearchParams(id.slice(queryStart + 1)).keys()) {
      if (!PASSTHROUGH_QUERIES.has(key)) return null
    }
  }
  return file
}
