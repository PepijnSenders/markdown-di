/**
 * The handful of path operations the module engine needs, written against
 * forward-slash paths so the engine runs in a browser bundle (no `node:path`).
 *
 * Every path the engine sees is absolute (the adapters resolve them before
 * handing them over). Backslashes are folded to forward slashes and a Windows
 * drive prefix (`C:/`) counts as a root, so disk paths from either platform
 * work.
 */

const DRIVE_ROOT = /^[A-Za-z]:\//

export function toPosix(path: string): string {
  return path.replace(/\\/g, '/')
}

export function isAbsolute(path: string): boolean {
  const posix = toPosix(path)
  return posix.startsWith('/') || DRIVE_ROOT.test(posix)
}

function rootOf(path: string): string {
  if (path.startsWith('/')) return '/'
  const drive = path.match(DRIVE_ROOT)
  return drive ? drive[0] : ''
}

/** Collapse `.`, `..` and duplicate separators. Keeps the root of an absolute path. */
export function normalize(path: string): string {
  const posix = toPosix(path)
  const root = rootOf(posix)
  const parts: string[] = []
  for (const part of posix.slice(root.length).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop()
      else if (!root) parts.push('..')
      continue
    }
    parts.push(part)
  }
  const joined = parts.join('/')
  return root ? root + joined : joined || '.'
}

export function join(...segments: string[]): string {
  return normalize(segments.filter((segment) => segment !== '').join('/'))
}

export function dirname(path: string): string {
  const posix = normalize(path)
  const root = rootOf(posix)
  const index = posix.lastIndexOf('/')
  if (index < root.length) return root || '.'
  return posix.slice(0, index)
}

export function basename(path: string): string {
  const posix = normalize(path)
  return posix.slice(posix.lastIndexOf('/') + 1)
}

/** Relative path from `from` to `to`, both absolute. */
export function relative(from: string, to: string): string {
  const fromParts = normalize(from).split('/').filter(Boolean)
  const toParts = normalize(to).split('/').filter(Boolean)
  let shared = 0
  while (
    shared < fromParts.length &&
    shared < toParts.length &&
    fromParts[shared] === toParts[shared]
  ) {
    shared++
  }
  const up = fromParts.slice(shared).map(() => '..')
  return [...up, ...toParts.slice(shared)].join('/')
}
