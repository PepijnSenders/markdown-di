import { RenderError } from './errors'
import { dirname, normalize } from './path'

/**
 * Every filesystem touch the module engine makes, behind one interface — so a
 * template graph renders the same against the real disk (`diskSources` from
 * `@markdown-di/core/modules/node`) or against an in-memory snapshot captured
 * at build time (`snapshotSources`), which is what lets a `.md` import run in
 * a `bun build --compile` binary or a browser bundle with no filesystem at all.
 */
export interface Sources {
  /** File contents at an absolute path. */
  read(absPath: string): string
  /** Whether an absolute path exists (and is a readable file). */
  exists(absPath: string): boolean
  /**
   * Absolute paths matching `pattern` resolved against `cwd` — files only,
   * sorted, with node_modules/dist/build pruned.
   */
  glob(pattern: string, cwd: string): string[]
  /** Shared-partials root for a `~/` prefix, discovered from `fromDir`, or null. */
  partialsRoot(fromDir: string): string | null
}

/**
 * A self-contained capture of a template and every partial it can reach: raw
 * sources keyed by absolute path, glob results, and the shared-partials root.
 * Because the partial *file set* is fixed by frontmatter and disk (never by
 * runtime params), a build-time walk captures everything a render will ever
 * need — see collectSources / createRendererFromSnapshot.
 */
export interface TemplateSnapshot {
  /** Absolute path of the entry template. */
  entry: string
  /** Raw contents of the entry file and every reachable partial, by absolute path. */
  files: Record<string, string>
  /** Recorded glob results, keyed by `${cwd} ${pattern}`. */
  globs: Record<string, string[]>
  /** Recorded shared-partials-root lookups, keyed by the directory queried. */
  partialsRoots: Record<string, string | null>
}

/** Sources that read only from a snapshot — no filesystem, no cwd dependence. */
export function snapshotSources(snapshot: TemplateSnapshot): Sources {
  return {
    read: (path) => {
      const contents = snapshot.files[path]
      if (contents === undefined) {
        throw new RenderError(
          'partial-not-found',
          path,
          `bundled template snapshot has no source for ${path}`,
        )
      }
      return contents
    },
    exists: (path) => Object.hasOwn(snapshot.files, path),
    glob: (pattern, cwd) => snapshot.globs[`${cwd} ${pattern}`] ?? [],
    partialsRoot: (fromDir) =>
      Object.hasOwn(snapshot.partialsRoots, fromDir) ? snapshot.partialsRoots[fromDir] : null,
  }
}

/**
 * Re-root every path in a snapshot at `/`, relative to `root` — or to the
 * nearest ancestor of `root` that contains every captured file — so a bundle
 * does not embed the build machine's directory layout. Rendering is unchanged:
 * the renderer only ever joins paths and looks them up in the snapshot.
 */
export function rebaseSnapshot(snapshot: TemplateSnapshot, root: string): TemplateSnapshot {
  const paths = [
    snapshot.entry,
    ...Object.keys(snapshot.files),
    ...Object.keys(snapshot.partialsRoots),
    ...Object.values(snapshot.partialsRoots).filter((path): path is string => path !== null),
    ...Object.values(snapshot.globs).flat(),
  ]
  let base = normalize(root)
  while (!paths.every((path) => path === base || path.startsWith(`${base}/`))) {
    const parent = dirname(base)
    if (parent === base) return snapshot
    base = parent
  }
  if (base === '/') return snapshot

  const rebase = (path: string) => {
    if (path === base) return '/'
    const rest = path.slice(base.length)
    return rest.startsWith('/') ? rest : `/${rest}`
  }
  const mapKeys = <T>(record: Record<string, T>, value: (item: T) => T) =>
    Object.fromEntries(Object.entries(record).map(([key, item]) => [rebase(key), value(item)]))
  return {
    entry: rebase(snapshot.entry),
    files: mapKeys(snapshot.files, (contents) => contents),
    // keys are `${cwd} ${pattern}` with cwd at or under base: the prefix rebases
    globs: mapKeys(snapshot.globs, (matches) => matches.map(rebase)),
    partialsRoots: mapKeys(snapshot.partialsRoots, (path) => (path === null ? null : rebase(path))),
  }
}

/**
 * Wrap `sources` so every touch is also recorded into a snapshot. Used at build
 * time: walk a graph through the recorder, then ship `snapshot`.
 */
export function recordingSources(
  sources: Sources,
  entry: string,
): { sources: Sources; snapshot: TemplateSnapshot } {
  const snapshot: TemplateSnapshot = { entry, files: {}, globs: {}, partialsRoots: {} }
  const { files, globs, partialsRoots } = snapshot
  return {
    snapshot,
    sources: {
      read: (path) => {
        const contents = sources.read(path)
        files[path] = contents
        return contents
      },
      exists: (path) => {
        const found = sources.exists(path)
        if (found) files[path] ??= sources.read(path)
        return found
      },
      glob: (pattern, cwd) => {
        const matches = sources.glob(pattern, cwd)
        globs[`${cwd} ${pattern}`] = matches
        for (const match of matches) files[match] ??= sources.read(match)
        return matches
      },
      partialsRoot: (fromDir) => {
        const root = sources.partialsRoot(fromDir)
        partialsRoots[fromDir] = root
        return root
      },
    },
  }
}
