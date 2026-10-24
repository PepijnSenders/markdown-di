import { basename, resolve } from 'node:path'
import {
  type ParamSpec,
  paramsInterfaceName,
  parseFrontmatter,
  RenderError,
  type RenderErrorCode,
  readModuleShape,
  renderModuleDeclaration,
  type Sources,
} from '@markdown-di/core/modules'
import { diskSources } from '@markdown-di/core/modules/node'
import {
  type MapperDiagnostic,
  type PositionEncoding,
  SpanMapFeature,
  SpanMapKind,
  type SpanMapping,
  type TransformResult,
} from './protocol'

export interface TransformOptions {
  /** Absolute path of the markdown file. */
  fileName: string
  /** Its current contents, which win over what is on disk. */
  content: string
  /** Where every other file is read from (collection members). @default diskSources */
  sources?: Sources
  /** The encoding of every reported position. @default 'utf-16' */
  positionEncoding?: PositionEncoding
}

/**
 * The virtual TypeScript module of a markdown file — the same declarations
 * `markdown-di-typegen` writes to a sibling `x.d.md.ts` — with each declared
 * param mapped back to its key in the frontmatter, so go-to-definition on
 * `render({ transcript })` lands on `transcript:` in the `.md` file.
 *
 * A strict-mode error in the file (malformed frontmatter, a bad declaration)
 * is reported as a diagnostic on its line, and the module falls back to an
 * untyped render function so importers still resolve.
 */
export function transformMarkdown(options: TransformOptions): TransformResult {
  const fileName = resolve(options.fileName)
  const { content } = options
  const encoding = options.positionEncoding ?? 'utf-16'
  const sources = withContent(options.sources ?? diskSources, fileName, content)

  let text: string
  let mappings: SpanMapping[]
  try {
    const shape = readModuleShape(fileName, sources)
    text = renderModuleDeclaration(basename(fileName), shape)
    mappings =
      shape.kind === 'render' ? paramMappings(fileName, content, shape.specs, text, encoding) : []
  } catch (error) {
    if (!(error instanceof RenderError)) throw error
    return {
      text: UNTYPED_MODULE,
      extension: '.ts',
      diagnostics: [diagnosticOf(error, fileName, content, encoding)],
    }
  }
  return { text, extension: '.ts', mappings }
}

const UNTYPED_MODULE = [
  'declare function render(params?: Record<string, unknown>): string',
  'export default render',
  '',
  'export declare const frontmatter: Record<string, unknown>',
  'export declare const source: string',
  '',
].join('\n')

function withContent(sources: Sources, fileName: string, content: string): Sources {
  const isFile = (path: string) => resolve(path) === fileName
  return {
    read: (path) => (isFile(path) ? content : sources.read(path)),
    exists: (path) => isFile(path) || sources.exists(path),
    glob: (pattern, cwd) => sources.glob(pattern, cwd),
    partialsRoot: (fromDir) => sources.partialsRoot(fromDir),
  }
}

const NAVIGATION =
  SpanMapFeature.Hover |
  SpanMapFeature.Definition |
  SpanMapFeature.References |
  SpanMapFeature.DocumentHighlights

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Each param's property name in the virtual params interface, mapped to its frontmatter key. */
function paramMappings(
  fileName: string,
  content: string,
  specs: ParamSpec[],
  text: string,
  encoding: PositionEncoding,
): SpanMapping[] {
  const interfaceStart = text.indexOf(
    `export interface ${paramsInterfaceName(basename(fileName))} {`,
  )
  if (interfaceStart === -1) return []

  const { keyLines } = parseFrontmatter(content, fileName)
  const lines = lineStarts(content)
  const declared = paramKeyOffsets(content, lines, keyLines.params)

  const mappings: SpanMapping[] = []
  for (const spec of specs) {
    if (!IDENTIFIER.test(spec.name)) continue
    const original =
      spec.source === 'params'
        ? declared.get(spec.name)
        : topLevelKeyOffset(content, lines, keyLines[spec.name], spec.name)
    // Interface members sit at exactly two spaces; record fields nest deeper.
    const member = text.indexOf(`\n  ${spec.name}${spec.required ? '' : '?'}: `, interfaceStart)
    if (original === undefined || member === -1) continue
    const [virtualStart, virtualLength] = encode(text, member + 3, spec.name.length, encoding)
    const [originalStart, originalLength] = encode(content, original, spec.name.length, encoding)
    mappings.push([
      virtualStart,
      virtualLength,
      originalStart,
      originalLength,
      SpanMapKind.Verbatim,
      NAVIGATION,
    ])
  }
  return mappings
}

const CHILD_KEY = /^([ \t]+)([A-Za-z_$][A-Za-z0-9_$]*)\??[ \t]*:/

/**
 * Offsets of the keys directly under a block-style `params:` mapping, found
 * by indentation. A flow-style `params: { … }` yields none (no mappings, still
 * typed).
 */
function paramKeyOffsets(
  content: string,
  lines: number[],
  paramsLine: number | undefined,
): Map<string, number> {
  const offsets = new Map<string, number>()
  if (paramsLine === undefined) return offsets
  let childIndent: string | undefined
  for (let line = paramsLine + 1; line <= lines.length; line++) {
    const text = lineText(content, lines, line)
    if (text.trim() === '' || text.trimStart().startsWith('#')) continue
    if (!/^[ \t]/.test(text)) break
    const match = CHILD_KEY.exec(text)
    childIndent ??= /^[ \t]+/.exec(text)?.[0]
    if (match && match[1] === childIndent) {
      offsets.set(match[2], lines[line - 1] + match[1].length)
    }
  }
  return offsets
}

function topLevelKeyOffset(
  content: string,
  lines: number[],
  line: number | undefined,
  name: string,
): number | undefined {
  if (line === undefined || !lineText(content, lines, line).startsWith(name)) return undefined
  return lines[line - 1]
}

const DIAGNOSTIC_CODES: Record<RenderErrorCode, number> = {
  'invalid-frontmatter': 1001,
  'invalid-declaration': 1002,
  'unknown-param': 1003,
  'missing-param': 1004,
  'wrong-type': 1005,
  'unresolved-tag': 1006,
  'unsupported-tag': 1007,
  'partial-not-found': 1008,
  'circular-partial': 1009,
}

/**
 * An error in this file is reported on its line, without the `(file:line)`
 * suffix the editor already shows; one without a line is a declaration error,
 * reported on the `params:` key. An error in another file (a collection
 * member) keeps its suffix and is reported at the top of this one.
 */
function diagnosticOf(
  error: RenderError,
  fileName: string,
  content: string,
  encoding: PositionEncoding,
): MapperDiagnostic {
  const code = DIAGNOSTIC_CODES[error.code]
  if (resolve(error.file) !== fileName) {
    return { messageText: error.message, start: 0, length: 0, code }
  }
  const suffix = error.line === undefined ? ` (${error.file})` : ` (${error.file}:${error.line})`
  const messageText = error.message.endsWith(suffix)
    ? error.message.slice(0, -suffix.length)
    : error.message
  const lines = lineStarts(content)
  const line = Math.min(error.line ?? paramsKeyLine(content, fileName) ?? 1, lines.length)
  const [start, length] = encode(
    content,
    lines[line - 1],
    lineText(content, lines, line).length,
    encoding,
  )
  return { messageText, start, length, code }
}

function paramsKeyLine(content: string, fileName: string): number | undefined {
  try {
    return parseFrontmatter(content, fileName).keyLines.params
  } catch {
    return undefined
  }
}

/** UTF-16 offset of the start of each line; `[n - 1]` is line n. */
function lineStarts(content: string): number[] {
  const starts = [0]
  for (let index = content.indexOf('\n'); index !== -1; index = content.indexOf('\n', index + 1)) {
    starts.push(index + 1)
  }
  return starts
}

function lineText(content: string, lines: number[], line: number): string {
  const start = lines[line - 1]
  if (start === undefined) return ''
  const end = line < lines.length ? lines[line] - 1 : content.length
  return content.slice(start, end).replace(/\r$/, '')
}

const utf8 = new TextEncoder()

/** A UTF-16 `[start, length]` in `text`, converted to the negotiated encoding. */
function encode(
  text: string,
  start: number,
  length: number,
  encoding: PositionEncoding,
): [number, number] {
  if (encoding === 'utf-16') return [start, length]
  return [
    utf8.encode(text.slice(0, start)).length,
    utf8.encode(text.slice(start, start + length)).length,
  ]
}
