import { RenderError } from './errors'
import { type ExtractedDocument, parseFrontmatter } from './frontmatter'
import { dirname, isAbsolute, normalize, relative } from './path'
import { type MarkdownSections, parseSections } from './sections'
import type { Sources } from './sources'

/**
 * What a markdown file imports as, declared by its `export:` frontmatter key:
 *
 * - `render` (the default) — a strict render function (a template)
 * - `data` — `{ frontmatter, keyLines, body, sections }`, no rendering at all
 * - `collection` — a manifest: every data file its `include` globs match
 */
export type ModuleKind = 'render' | 'data' | 'collection'

const KINDS: ReadonlySet<string> = new Set<ModuleKind>(['render', 'data', 'collection'])
const COLLECTION_KEYS: ReadonlySet<string> = new Set(['export', 'include', 'exclude'])

/** A data file: its frontmatter (minus `export`), its body, and the body split by headings. */
export interface DataModule<Frontmatter = Record<string, unknown>> {
  frontmatter: Frontmatter
  /** 1-based source line of each top-level frontmatter key, so a consumer's validation can point at it. */
  keyLines: Record<string, number>
  /** The markdown after the frontmatter, trimmed. */
  body: string
  sections: MarkdownSections
}

/** One member of a collection: a data module plus its path relative to the manifest. */
export interface CollectionEntry<Frontmatter = Record<string, unknown>>
  extends DataModule<Frontmatter> {
  /** Path of the member relative to the manifest's directory, with `/` separators. */
  path: string
}

export interface CollectionDeclaration {
  /** Absolute directory the patterns resolve against (the manifest's directory). */
  dir: string
  include: string[]
  exclude: string[]
}

export type MarkdownModule =
  | { kind: 'render'; path: string }
  | { kind: 'data'; path: string; data: DataModule }
  | {
      kind: 'collection'
      path: string
      declaration: CollectionDeclaration
      entries: CollectionEntry[]
      /** The manifest and every member — what a bundler should watch. */
      files: string[]
    }

/**
 * Read a markdown file's `export:` declaration. Throws (with the line) on an
 * unknown value; a file without frontmatter or without the key is `render`.
 */
export function moduleKind(document: ExtractedDocument, file: string): ModuleKind {
  const value = document.frontmatter.export
  if (value === undefined) return 'render'
  if (typeof value !== 'string' || !KINDS.has(value)) {
    throw new RenderError(
      'invalid-declaration',
      file,
      `\`export\` must be one of render | data | collection, got ${JSON.stringify(value)}`,
      document.keyLines.export,
    )
  }
  return value as ModuleKind
}

/**
 * Load a markdown file as the module its frontmatter declares. Data and
 * collections are fully read here (they are plain values); a `render` module
 * only reports its kind — build the renderer with createRenderer (live) or
 * collectSources (snapshot).
 */
export function loadModule(filePath: string, sources: Sources): MarkdownModule {
  const path = normalize(filePath)
  const source = sources.read(path)
  const document = parseFrontmatter(source, path)
  switch (moduleKind(document, path)) {
    case 'render':
      return { kind: 'render', path }
    case 'data':
      return { kind: 'data', path, data: toDataModule(document) }
    case 'collection': {
      const declaration = collectionDeclaration(document, path)
      const members = collectionMembers(declaration, path, sources)
      const entries = members.map((member) => ({
        path: relative(declaration.dir, member),
        ...readMember(member, sources),
      }))
      return { kind: 'collection', path, declaration, entries, files: [path, ...members] }
    }
  }
}

/** Read one file as data, whatever its `export:` says — unless it says something else. */
function readMember(path: string, sources: Sources): DataModule {
  const document = parseFrontmatter(sources.read(path), path)
  const kind = moduleKind(document, path)
  // Membership is the opt-in; a member only needs `export:` to agree, if set.
  if (document.frontmatter.export !== undefined && kind !== 'data') {
    throw new RenderError(
      'invalid-declaration',
      path,
      `a collection member is data, but this file declares \`export: ${kind}\``,
      document.keyLines.export,
    )
  }
  return toDataModule(document)
}

function toDataModule(document: ExtractedDocument): DataModule {
  const { export: _declaration, ...frontmatter } = document.frontmatter
  const { export: _declarationLine, ...keyLines } = document.keyLines
  return {
    frontmatter,
    keyLines,
    body: document.body.trim(),
    sections: parseSections(document.body, document.bodyLine),
  }
}

function collectionDeclaration(document: ExtractedDocument, file: string): CollectionDeclaration {
  const { frontmatter, keyLines } = document
  for (const key of Object.keys(frontmatter)) {
    if (!COLLECTION_KEYS.has(key)) {
      throw new RenderError(
        'invalid-declaration',
        file,
        `unknown key "${key}" in a collection manifest — it takes only \`include\` and \`exclude\``,
        keyLines[key],
      )
    }
  }
  const include = patternList(frontmatter.include, 'include', document, file)
  if (include.length === 0) {
    throw new RenderError(
      'invalid-declaration',
      file,
      'a collection manifest needs `include`: a glob (or list of globs) relative to the manifest',
      keyLines.include ?? keyLines.export,
    )
  }
  const exclude = patternList(frontmatter.exclude, 'exclude', document, file)
  return { dir: dirname(file), include, exclude }
}

function patternList(
  value: unknown,
  key: string,
  document: ExtractedDocument,
  file: string,
): string[] {
  if (value === undefined) return []
  const list = Array.isArray(value) ? value : [value]
  for (const pattern of list) {
    if (typeof pattern !== 'string' || pattern.trim() === '') {
      throw new RenderError(
        'invalid-declaration',
        file,
        `\`${key}\` must be a glob or a list of globs`,
        document.keyLines[key],
      )
    }
    const segments = pattern.split('/')
    if (isAbsolute(pattern) || segments.includes('..')) {
      throw new RenderError(
        'invalid-declaration',
        file,
        `\`${key}\` pattern "${pattern}" must stay inside the manifest's directory`,
        document.keyLines[key],
      )
    }
  }
  return list as string[]
}

function collectionMembers(
  declaration: CollectionDeclaration,
  manifest: string,
  sources: Sources,
): string[] {
  const glob = (patterns: string[]) =>
    new Set(
      patterns.flatMap((pattern) =>
        sources.glob(pattern, declaration.dir).map((match) => normalize(match)),
      ),
    )
  const excluded = glob(declaration.exclude)
  const members = [...glob(declaration.include)]
    .filter((member) => member !== manifest && !excluded.has(member))
    .sort((a, b) => (relative(declaration.dir, a) < relative(declaration.dir, b) ? -1 : 1))
  if (members.length === 0) {
    throw new RenderError(
      'invalid-declaration',
      manifest,
      `collection matches no files: include ${JSON.stringify(declaration.include)}` +
        (declaration.exclude.length > 0 ? `, exclude ${JSON.stringify(declaration.exclude)}` : ''),
    )
  }
  return members
}
