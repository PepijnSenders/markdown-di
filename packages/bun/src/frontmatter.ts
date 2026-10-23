import { type ExtractedDocument, parseFrontmatter } from '@markdown-di/core/modules'

const OPEN = '---\n'
const CLOSE = '\n---'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Read a file's frontmatter with Bun's native YAML parser when it is a plain
 * `---` block: about 50× faster than the yaml package, which matters for a
 * program that imports hundreds of templates at start. Any other shape, an
 * empty block, and any parse error go to core's parser, which keeps the exact
 * semantics and names the file and line. `keyLines` is left empty on the fast
 * path: the loader reads it only to point an invalid `export:` at its line, and
 * an `export:` other than `render` is re-read through core.
 */
export function readFrontmatter(source: string, file: string): ExtractedDocument {
  const close = source.startsWith(OPEN) ? source.indexOf(CLOSE, OPEN.length) : -1
  if (close === -1) return parseFrontmatter(source, file)
  const after = source.charAt(close + CLOSE.length)
  if (after !== '\n' && after !== '') return parseFrontmatter(source, file)
  let parsed: unknown
  try {
    parsed = Bun.YAML.parse(source.slice(OPEN.length, close))
  } catch {
    return parseFrontmatter(source, file)
  }
  if (!isRecord(parsed) || Object.keys(parsed).length === 0 || parsed.export !== undefined) {
    return parseFrontmatter(source, file)
  }
  const bodyStart = close + CLOSE.length + (after === '\n' ? 1 : 0)
  const body = source.slice(bodyStart)
  return {
    frontmatter: parsed,
    body,
    hasFrontmatter: true,
    bodyLine: source.slice(0, bodyStart).split('\n').length,
    keyLines: {},
  }
}
