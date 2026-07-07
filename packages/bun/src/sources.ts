import { existsSync, readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { Glob } from 'bun'
import { findPartialsRoot } from './config'

/**
 * Every filesystem touch the renderer makes, behind one interface — so a
 * template graph can render either against the real disk (the default) or
 * against an in-memory snapshot captured at build time (see bundle.ts).
 *
 * The snapshot path is what lets a `.md` import survive `bun build --compile`
 * into a standalone binary: the runtime `loader: 'object'` returns a live
 * function that the bundler can't serialize, whereas the bundle loader inlines
 * a snapshot and rebuilds the renderer from it with no disk access at all.
 */
export interface Sources {
  /** File contents at an absolute path. */
  read(absPath: string): string
  /** Whether an absolute path exists (and is a readable file). */
  exists(absPath: string): boolean
  /**
   * Absolute paths matching `pattern` resolved against `cwd` — sorted, with
   * node_modules/dist/build pruned (mirrors the disk glob semantics).
   */
  glob(pattern: string, cwd: string): string[]
  /** Shared-partials root for a `~/` prefix, discovered from `fromDir`, or null. */
  partialsRoot(fromDir: string): string | null
}

const GLOB_IGNORE = /(^|\/)(node_modules|dist|build)\//

/** The default resolver: reads the real filesystem. */
export const diskSources: Sources = {
  read: (path) => readFileSync(path, 'utf-8'),
  exists: (path) => existsSync(path),
  glob: (pattern, cwd) =>
    [...new Glob(pattern).scanSync({ cwd, absolute: true, onlyFiles: true })]
      .filter((match) => !GLOB_IGNORE.test(relative(cwd, match)))
      .sort(),
  partialsRoot: (fromDir) => findPartialsRoot(fromDir),
}
