import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import {
  loadModule,
  moduleKind,
  type ParamSpec,
  parseFrontmatter,
  parseParamSpecs,
} from '@markdown-di/core/modules'
import { diskSources } from '@markdown-di/core/modules/node'
import { Glob } from 'bun'

export interface TypegenOptions {
  /** Directory to resolve glob patterns from. @default process.cwd() */
  cwd?: string
  /** When false, declarations are returned but not written to disk. @default true */
  write?: boolean
  /**
   * Emit ONE declaration file at this path (resolved against `cwd`) containing a
   * wildcard ambient module block (`declare module '*<basename>'`) per matched
   * template, instead of a sibling `.d.md.ts` per file. Requires every matched
   * template to have a unique basename that is not a proper suffix of another
   * (the patterns match imports by filename).
   */
  singleFile?: string
  /**
   * Single-file mode only: append the generic `*.md` / `*.markdown` fallback
   * blocks after the per-template blocks, so unmatched markdown imports type as
   * `(params?: Record<string, unknown>) => string`. Prefer this over referencing
   * `@markdown-di/bun/md-modules` alongside a single file — ambient wildcard
   * ties are broken by declaration order, and a separately loaded generic
   * fallback can shadow the per-template blocks. @default false
   */
  includeFallback?: boolean
  /**
   * Sink for non-fatal warnings (stale sibling `.d.md.ts` files in single-file
   * mode). @default console.warn
   */
  warn?: (message: string) => void
}

export interface TypegenEntry {
  /** Absolute path of the markdown file. */
  file: string
  /**
   * Absolute path of the generated declaration file (`x.d.md.ts` for `x.md`; in
   * single-file mode, the shared output file).
   */
  declarationFile: string
  /** Declaration file contents (in single-file mode, the whole shared file). */
  contents: string
}

const MARKDOWN_EXTENSION = /\.(md|markdown)$/i
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * Walk glob patterns of markdown files and emit a sibling `.d.md.ts` declaration
 * for each (like typed-css-modules), typing each module by what it exports: a
 * template's render function from its frontmatter param declarations; a data
 * file's frontmatter as a literal (`as const`-style) type; a collection as a
 * readonly tuple of its members' literal types. Requires `"allowArbitraryExtensions":
 * true` in the consumer's tsconfig so TypeScript picks the declarations up.
 *
 * With `singleFile` set, emits one declaration file of wildcard ambient module
 * blocks instead — no sibling files, no `allowArbitraryExtensions` needed.
 */
export function typegen(patterns: string | string[], options: TypegenOptions = {}): TypegenEntry[] {
  const cwd = resolve(options.cwd ?? process.cwd())
  const files = new Set<string>()
  for (const pattern of Array.isArray(patterns) ? patterns : [patterns]) {
    for (const file of new Glob(pattern).scanSync({ cwd, absolute: true, onlyFiles: true })) {
      if (MARKDOWN_EXTENSION.test(file) && !/(^|\/)node_modules\//.test(file)) {
        files.add(file)
      }
    }
  }
  const sorted = [...files].sort()

  if (options.singleFile !== undefined) {
    return typegenSingleFile(sorted, resolve(cwd, options.singleFile), options)
  }

  const entries: TypegenEntry[] = []
  for (const file of sorted) {
    const contents = generateDeclaration(file)
    const declarationFile = siblingDeclarationFile(file)
    if (options.write !== false) {
      writeFileSync(declarationFile, contents, 'utf-8')
    }
    entries.push({ file, declarationFile, contents })
  }
  return entries
}

function typegenSingleFile(
  files: string[],
  outFile: string,
  options: TypegenOptions,
): TypegenEntry[] {
  if (files.length === 0) return []
  const contents = generateSingleFileDeclaration(files, {
    includeFallback: options.includeFallback,
  })

  const staleSiblings = files.map(siblingDeclarationFile).filter((file) => existsSync(file))
  if (staleSiblings.length > 0) {
    const warn = options.warn ?? console.warn
    warn(
      'single-file typegen: stale sibling declaration(s) exist for matched templates. ' +
        'TypeScript prefers a resolved sibling .d.md.ts over ambient wildcard modules, so ' +
        `these shadow ${outFile} (possibly with stale types); delete them:\n` +
        staleSiblings.map((file) => `  ${file}`).join('\n'),
    )
  }

  if (options.write !== false) {
    mkdirSync(dirname(outFile), { recursive: true })
    writeFileSync(outFile, contents, 'utf-8')
  }
  return files.map((file) => ({ file, declarationFile: outFile, contents }))
}

export interface SingleFileDeclarationOptions {
  /** Append the generic `*.md` / `*.markdown` fallback blocks. @default false */
  includeFallback?: boolean
}

/**
 * Generate the contents of a single declaration file covering all given markdown
 * files: one `declare module '*<basename>'` block per file. Throws when two
 * basenames collide (equal, or one a proper suffix of another) — the wildcard
 * patterns match import specifiers by filename, so such basenames are ambiguous.
 */
export function generateSingleFileDeclaration(
  filePaths: string[],
  options: SingleFileDeclarationOptions = {},
): string {
  const files = [...new Set(filePaths.map((filePath) => resolve(filePath)))].sort()
  assertPatternSafeBasenames(files)

  const shapes = files.map((file) => ({ file, shape: readModuleShape(file) }))
  const blocks = shapes.map(({ file, shape }) => renderAmbientModule(basename(file), shape))
  if (shapes.some(({ shape }) => shape.kind !== 'render')) {
    blocks.unshift(renderSectionTypesModule())
  }
  if (options.includeFallback) {
    blocks.push(renderFallbackModule('md'), renderFallbackModule('markdown'))
  }
  return `${['// Generated by @markdown-di/bun typegen — do not edit.', '', blocks.join('\n\n')].join('\n')}\n`
}

/**
 * A pattern `'*x.md'` matches any import specifier ending in `x.md` (`*` is
 * greedy over the rest of the specifier), so two templates collide as soon as
 * one basename is a suffix of the other — equal (`a/compile.md` vs
 * `b/compile.md`) or proper (`./self-narrate.md` matches `'*narrate.md'`).
 */
function assertPatternSafeBasenames(files: string[]): void {
  const byBasename = new Map<string, string[]>()
  for (const file of files) {
    const name = basename(file)
    const paths = byBasename.get(name)
    if (paths) paths.push(file)
    else byBasename.set(name, [file])
  }

  const duplicates = [...byBasename.entries()].filter(([, paths]) => paths.length > 1)
  if (duplicates.length > 0) {
    const details = duplicates
      .map(([name, paths]) => `  ${name}:\n${paths.map((path) => `    ${path}`).join('\n')}`)
      .join('\n')
    throw new Error(
      'single-file typegen requires unique template basenames — the generated ambient ' +
        `pattern '*<basename>' matches imports by filename, so these collide:\n${details}`,
    )
  }

  const entries = [...byBasename.entries()]
  const suffixCollisions: string[] = []
  for (const [shorter, [shorterPath]] of entries) {
    for (const [longer, [longerPath]] of entries) {
      if (longer !== shorter && longer.endsWith(shorter)) {
        suffixCollisions.push(
          `  '${shorter}' is a proper suffix of '${longer}':\n    ${shorterPath}\n    ${longerPath}`,
        )
      }
    }
  }
  if (suffixCollisions.length > 0) {
    throw new Error(
      'single-file typegen forbids a template basename that is a proper suffix of another — ' +
        "an import of the longer name also matches the shorter name's pattern (e.g. " +
        `'./self-narrate.md' matches '*narrate.md'):\n${suffixCollisions.join('\n')}`,
    )
  }
}

function renderAmbientModule(fileName: string, shape: ModuleShape): string {
  if (shape.kind === 'data') {
    return [
      `declare module '*${fileName}' {`,
      `  import type { MarkdownSections } from '${SECTION_TYPES_MODULE}'`,
      '',
      indent(dataDeclarations(shape.frontmatter, 'const'), 2),
      '}',
    ].join('\n')
  }
  if (shape.kind === 'collection') {
    return [
      `declare module '*${fileName}' {`,
      `  import type { MarkdownSections } from '${SECTION_TYPES_MODULE}'`,
      '',
      `  const entries: ${indent(collectionType(shape.entries), 2).trimStart()}`,
      '  export default entries',
      '}',
    ].join('\n')
  }

  const { specs } = shape
  const lines: string[] = [`declare module '*${fileName}' {`]

  let renderSignature: string
  if (specs.length === 0) {
    renderSignature = '  const render: () => string'
  } else {
    const interfaceName = paramsInterfaceName(fileName)
    lines.push(`  export interface ${interfaceName} {`)
    for (const spec of specs) {
      lines.push(`    ${propertyName(spec.name)}${spec.required ? '' : '?'}: ${spec.type}`)
    }
    lines.push('  }', '')
    const optional = specs.every((spec) => !spec.required) ? '?' : ''
    renderSignature = `  const render: (params${optional}: ${interfaceName}) => string`
  }

  lines.push(
    renderSignature,
    '  export default render',
    '',
    '  export const frontmatter: Record<string, unknown>',
    '  export const source: string',
    '}',
  )
  return lines.join('\n')
}

function renderFallbackModule(extension: string): string {
  return [
    `declare module '*.${extension}' {`,
    '  const render: (params?: Record<string, unknown>) => string',
    '  export default render',
    '',
    '  export const frontmatter: Record<string, unknown>',
    '  export const source: string',
    '}',
  ].join('\n')
}

/** Generate the declaration file contents for a single markdown file. */
export function generateDeclaration(filePath: string): string {
  const path = resolve(filePath)
  const shape = readModuleShape(path)
  const fileName = basename(path)
  if (shape.kind === 'data') {
    return [
      `// Generated by @markdown-di/bun typegen from ${fileName} — do not edit.`,
      '',
      SECTION_TYPES,
      '',
      dataDeclarations(shape.frontmatter, 'declare const'),
      '',
    ].join('\n')
  }
  if (shape.kind === 'collection') {
    return [
      `// Generated by @markdown-di/bun typegen from ${fileName} — do not edit.`,
      '',
      SECTION_TYPES,
      '',
      `declare const entries: ${collectionType(shape.entries)}`,
      'export default entries',
      '',
    ].join('\n')
  }
  return renderDeclaration(fileName, shape.specs)
}

type ModuleShape =
  | { kind: 'render'; specs: ParamSpec[] }
  | { kind: 'data'; frontmatter: Record<string, unknown> }
  | { kind: 'collection'; entries: Array<{ path: string; frontmatter: Record<string, unknown> }> }

/** What a markdown file exports, read the same way the loaders read it. */
function readModuleShape(filePath: string): ModuleShape {
  const document = parseFrontmatter(diskSources.read(filePath), filePath)
  switch (moduleKind(document, filePath)) {
    case 'render':
      return {
        kind: 'render',
        specs: document.hasFrontmatter ? parseParamSpecs(document.frontmatter, filePath) : [],
      }
    case 'data':
    case 'collection': {
      const loaded = loadModule(filePath, diskSources)
      if (loaded.kind === 'data') return { kind: 'data', frontmatter: loaded.data.frontmatter }
      if (loaded.kind === 'collection') {
        return {
          kind: 'collection',
          entries: loaded.entries.map(({ path, frontmatter }) => ({ path, frontmatter })),
        }
      }
      throw new Error(`unreachable: ${filePath} changed kind while loading`)
    }
  }
}

/**
 * The shape of `sections` (see `MarkdownSections` in @markdown-di/core/modules),
 * written out so generated declarations depend on no installed package.
 */
const SECTION_TYPES = `export interface MarkdownRow {
  readonly label: string
  readonly text: string
  readonly line: number
}

export interface MarkdownBlock {
  readonly category: string | null
  readonly paragraphs: readonly string[]
  readonly rows: readonly MarkdownRow[]
  readonly content: string
}

export interface MarkdownSection extends MarkdownBlock {
  readonly heading: string
  readonly line: number
}

export interface MarkdownSections extends MarkdownBlock {
  readonly title: string | null
  readonly sections: readonly MarkdownSection[]
}`

/** Single-file mode: the section types, once, as an ambient module the blocks import. */
const SECTION_TYPES_MODULE = 'markdown-di:types'

function renderSectionTypesModule(): string {
  return [`declare module '${SECTION_TYPES_MODULE}' {`, indent(SECTION_TYPES, 2), '}'].join('\n')
}

function dataDeclarations(frontmatter: Record<string, unknown>, declare: string): string {
  const exportDeclare = declare === 'const' ? 'export const' : 'export declare const'
  return [
    `${declare} data: {`,
    `  readonly frontmatter: ${indent(literalType(frontmatter), 2).trimStart()}`,
    '  readonly body: string',
    '  readonly sections: MarkdownSections',
    '}',
    'export default data',
    '',
    `${exportDeclare} frontmatter: typeof data.frontmatter`,
    `${exportDeclare} body: string`,
    `${exportDeclare} sections: MarkdownSections`,
  ].join('\n')
}

function collectionType(entries: Array<{ path: string; frontmatter: Record<string, unknown> }>) {
  const items = entries.map((entry) =>
    [
      '{',
      `  readonly path: ${JSON.stringify(entry.path)}`,
      `  readonly frontmatter: ${indent(literalType(entry.frontmatter), 2).trimStart()}`,
      '  readonly body: string',
      '  readonly sections: MarkdownSections',
      '}',
    ].join('\n'),
  )
  return `readonly [\n${items.map((item) => `${indent(item, 2)},`).join('\n')}\n]`
}

/**
 * The literal (`as const`-style) type of a parsed YAML value: string, number
 * and boolean literals, readonly tuples, and readonly object types — so a
 * consumer can derive unions such as `(typeof cards)[number]['frontmatter']['id']`.
 */
function literalType(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'number'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'readonly []'
    const items = value.map(literalType)
    const inline = `readonly [${items.join(', ')}]`
    if (items.every((item) => !item.includes('\n')) && inline.length <= 80) return inline
    return `readonly [\n${items.map((item) => `${indent(item, 2)},`).join('\n')}\n]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    const members = entries.map(
      ([key, item]) =>
        `  readonly ${propertyName(key)}: ${indent(literalType(item), 2).trimStart()}`,
    )
    return `{\n${members.join('\n')}\n}`
  }
  return 'unknown'
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line === '' ? line : pad + line))
    .join('\n')
}

function siblingDeclarationFile(file: string): string {
  return file.replace(MARKDOWN_EXTENSION, (_match, ext) => `.d.${ext}.ts`)
}

function renderDeclaration(fileName: string, specs: ParamSpec[]): string {
  const lines: string[] = [
    `// Generated by @markdown-di/bun typegen from ${fileName} — do not edit.`,
    '',
  ]

  let renderSignature: string
  if (specs.length === 0) {
    renderSignature = 'declare function render(): string'
  } else {
    const interfaceName = paramsInterfaceName(fileName)
    lines.push(`export interface ${interfaceName} {`)
    for (const spec of specs) {
      lines.push(`  ${propertyName(spec.name)}${spec.required ? '' : '?'}: ${spec.type}`)
    }
    lines.push('}', '')
    const optional = specs.every((spec) => !spec.required) ? '?' : ''
    renderSignature = `declare function render(params${optional}: ${interfaceName}): string`
  }

  lines.push(
    renderSignature,
    'export default render',
    '',
    'export declare const frontmatter: Record<string, unknown>',
    'export declare const source: string',
    '',
  )
  return lines.join('\n')
}

function paramsInterfaceName(fileName: string): string {
  const stem = fileName.replace(MARKDOWN_EXTENSION, '')
  const pascal = stem
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('')
  const safe = /^[0-9]/.test(pascal) ? `_${pascal}` : pascal || 'Markdown'
  return `${safe}Params`
}

function propertyName(name: string): string {
  return IDENTIFIER.test(name) ? name : JSON.stringify(name)
}
