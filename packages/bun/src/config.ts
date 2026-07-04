import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { RenderError } from './errors'

const CONFIG_FILENAME = '.markdown-di.json'

/**
 * Resolve the shared-partials root for a template file: walk up from the
 * file's directory looking for a `.markdown-di.json` with a `partialsRoot`
 * field (a directory path, resolved relative to the config file). Returns the
 * absolute root, or null when no config declares one.
 *
 * Templates opt in per partial with a `~/` path prefix — see resolvePartialPaths
 * in render.ts. The walk stops at the nearest config file that exists, so a
 * nested package can override an outer one.
 */
export function findPartialsRoot(fromDir: string): string | null {
  let dir = resolve(fromDir)
  for (;;) {
    const configPath = join(dir, CONFIG_FILENAME)
    if (existsSync(configPath)) {
      return partialsRootFrom(configPath)
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function partialsRootFrom(configPath: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch (error) {
    throw new RenderError(
      'invalid-declaration',
      configPath,
      `failed to parse ${CONFIG_FILENAME}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RenderError('invalid-declaration', configPath, `${CONFIG_FILENAME} must be a JSON object`)
  }
  const root = (parsed as Record<string, unknown>).partialsRoot
  if (root === undefined) return null
  if (typeof root !== 'string' || root.trim() === '') {
    throw new RenderError(
      'invalid-declaration',
      configPath,
      '`partialsRoot` must be a non-empty string (a directory path relative to the config file)',
    )
  }
  return isAbsolute(root) ? root : resolve(dirname(configPath), root)
}
