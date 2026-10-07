import { isMap, isScalar, LineCounter, parseDocument } from 'yaml'
import { RenderError } from './errors'

export interface ExtractedDocument {
  /** Parsed YAML frontmatter; `{}` when the file has none. */
  frontmatter: Record<string, unknown>
  /** Everything after the closing delimiter (the whole source when there is no frontmatter). */
  body: string
  /** Whether a non-empty frontmatter block was found. */
  hasFrontmatter: boolean
  /** 1-based source line on which `body` starts. */
  bodyLine: number
  /** 1-based source line of each top-level frontmatter key, for positional errors. */
  keyLines: Record<string, number>
}

const OPEN = '---'
const CLOSE = '\n---'
const YAML_LANGUAGES: ReadonlySet<string> = new Set(['yaml', 'yml', 'json'])

/**
 * Split a markdown file into YAML frontmatter and body, and parse the YAML.
 *
 * The split mirrors gray-matter (what @markdown-di/core's processor uses), so
 * templates render identically everywhere — pinned by the parity tests — but
 * it runs without Node (`Buffer`, `fs`), so the same parser works in a browser
 * bundle. On top of gray-matter it is strict and positional: YAML errors,
 * duplicate keys and a non-mapping root throw a RenderError with the source
 * line, e.g. `Map keys must be unique (process/framed.gate.md:7)`.
 */
export function parseFrontmatter(source: string, file: string): ExtractedDocument {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  const none: ExtractedDocument = {
    frontmatter: {},
    body: source,
    hasFrontmatter: false,
    bodyLine: 1,
    keyLines: {},
  }

  // `----` (or longer) is a thematic break, not an opening delimiter.
  if (!text.startsWith(OPEN) || text.charAt(OPEN.length) === '-') return none

  let rest = text.slice(OPEN.length)
  const newline = rest.search(/\r?\n/)
  const language = (newline === -1 ? rest : rest.slice(0, newline)).trim()
  if (language !== '') {
    if (!YAML_LANGUAGES.has(language.toLowerCase())) {
      throw new RenderError(
        'invalid-frontmatter',
        file,
        `unsupported frontmatter language "${language}" — only YAML frontmatter is supported`,
        1,
      )
    }
    rest = rest.slice(newline === -1 ? rest.length : newline)
  }

  let close = rest.indexOf(CLOSE)
  if (close === -1) close = rest.length
  const block = rest.slice(0, close)

  let body = ''
  if (close < rest.length) {
    body = rest.slice(close + CLOSE.length)
    if (body[0] === '\r') body = body.slice(1)
    if (body[0] === '\n') body = body.slice(1)
  }

  // Comment-only or blank frontmatter counts as none (as in gray-matter).
  if (block.replace(/^\s*#[^\n]+/gm, '').trim() === '') return none

  const parsed = parseYamlBlock(block, file)
  if (parsed === null) return none

  // The block starts on line 1 (right after `---`), so YAML line N is file line N.
  const bodyLine = text.slice(0, text.length - body.length).split('\n').length
  return {
    frontmatter: parsed.value,
    keyLines: parsed.keyLines,
    body,
    hasFrontmatter: true,
    bodyLine,
  }
}

function parseYamlBlock(
  block: string,
  file: string,
): { value: Record<string, unknown>; keyLines: Record<string, number> } | null {
  const lineCounter = new LineCounter()
  const document = parseDocument(block, { lineCounter, prettyErrors: false })

  const [error] = document.errors
  if (error) {
    const { line } = lineCounter.linePos(error.pos[0])
    throw new RenderError(
      'invalid-frontmatter',
      file,
      `invalid YAML frontmatter: ${error.message}`,
      line,
    )
  }

  if (document.contents === null) return null
  if (!isMap(document.contents)) {
    const offset = document.contents.range?.[0] ?? 0
    throw new RenderError(
      'invalid-frontmatter',
      file,
      'frontmatter must be a YAML mapping of key: value pairs',
      lineCounter.linePos(offset).line,
    )
  }

  const value = document.toJS() as Record<string, unknown>
  if (Object.keys(value).length === 0) return null

  const keyLines: Record<string, number> = {}
  for (const item of document.contents.items) {
    const key = isScalar(item.key) ? String(item.key.value) : undefined
    const offset = (item.key as { range?: [number, number, number] } | null)?.range?.[0]
    if (key !== undefined && offset !== undefined) keyLines[key] = lineCounter.linePos(offset).line
  }
  return { value, keyLines }
}
