import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import Mustache from 'mustache'
import { RenderError } from './errors'
import { extractFrontmatter } from './frontmatter'
import { type ParamSpec, parseParamSpecs, validateArgs } from './params'
import { diskSources, type Sources } from './sources'
import { checkTemplate, hasSections } from './strict'

export type RenderFunction = (params?: Record<string, unknown>) => string

export interface Renderer {
  /** Strict render: throws instead of ever producing a silently-empty tag. */
  render: RenderFunction
  /** Parsed frontmatter of the file, including the `params:` declaration block. */
  frontmatter: Record<string, unknown>
  /** Raw file contents. */
  source: string
  /** Absolute path of the file. */
  path: string
  /** Params derived from the frontmatter declarations. */
  params: ParamSpec[]
}

// Mirrors core's ContentProcessor: markdown output is never HTML-escaped.
const MUSTACHE_RENDER_CONFIG = { escape: (text: string) => text }
const GLOB_MAGIC = /[*?[\]{}]/
const PARENT_REFERENCE = /^\$parent(?:\(['"](.+?)['"]\))?$/

interface RenderContext {
  /** Partial paths always resolve against the entry file's directory (as in core). */
  baseDir: string
  /**
   * Lazily-resolved shared-partials root for `~/`-prefixed paths, discovered
   * from the entry file's directory via `.markdown-di.json` (see config.ts).
   * Anchored at the entry file, like baseDir, so nested partials share it.
   */
  partialsRoot: () => string | null
  /** Files currently being rendered, for circular-partial detection. */
  visited: Set<string>
  /** Declared param names, so optional-but-absent params error precisely. */
  declared: ReadonlySet<string>
  /** Where file contents, existence, and globs are read from (disk or a snapshot). */
  sources: Sources
}

/**
 * Compile a markdown-di file into a strict, synchronous render function.
 *
 * The rendering semantics mirror @markdown-di/core's ContentProcessor (partials,
 * nested partials, `$parent` scoping, glob patterns) and are pinned against core
 * by test/parity.test.ts. On top of core's behavior, rendering is strict: any
 * violation throws a RenderError instead of producing an empty string.
 *
 * `sources` abstracts every filesystem touch; it defaults to the real disk. Pass
 * an in-memory resolver (see createRendererFromSnapshot) to render a graph that
 * was captured at build time — the basis for bundling `.md` imports into a
 * standalone binary.
 */
export function createRenderer(filePath: string, sources: Sources = diskSources): Renderer {
  const path = resolve(filePath)
  const source = sources.read(path)

  let document: ReturnType<typeof extractFrontmatter>
  try {
    document = extractFrontmatter(source)
  } catch (error) {
    throw new RenderError(
      'invalid-declaration',
      path,
      `failed to parse frontmatter: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const { frontmatter, body, hasFrontmatter } = document

  if (!hasFrontmatter) {
    // Plain markdown without frontmatter imports verbatim and declares no params.
    const render: RenderFunction = (params = {}) => {
      const keys = Object.keys(params)
      if (keys.length > 0) {
        throw new RenderError(
          'unknown-param',
          path,
          `unknown param "${keys[0]}" — this file has no frontmatter and declares no params`,
        )
      }
      return source
    }
    return { render, frontmatter: {}, source, path, params: [] }
  }

  const specs = parseParamSpecs(frontmatter, path)

  // Shared-partials root: resolved at most once per renderer, and only when a
  // partial actually uses the `~/` prefix (the common case pays no fs walk).
  let sharedRoot: string | null | undefined
  const partialsRoot = () => {
    if (sharedRoot === undefined) sharedRoot = sources.partialsRoot(dirname(path))
    return sharedRoot
  }

  const render: RenderFunction = (params = {}) => {
    validateArgs(specs, params, path)

    const view: Record<string, unknown> = { ...frontmatter }
    delete view.params // the declaration block is not template data
    for (const spec of specs) {
      if (spec.source === 'dynamic') delete view[spec.name] // drop '$dynamic' markers
    }
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) view[key] = value
    }

    const context: RenderContext = {
      baseDir: dirname(path),
      partialsRoot,
      visited: new Set([path]),
      declared: new Set(specs.map((spec) => spec.name)),
      sources,
    }

    // Partials resolve against the view (params and frontmatter reach `$parent`),
    // mirroring core's ordering: partials first, then the body.
    const partials = resolvePartials(frontmatter.partials, view, context, path)
    view.partials = partials.contents
    checkTemplate(body, [view], context.declared, path, partials.conditionallyBlank)
    return Mustache.render(body, view, {}, MUSTACHE_RENDER_CONFIG).trim()
  }

  return { render, frontmatter, source, path, params: specs }
}

interface ResolvedPartials {
  contents: Record<string, string>
  /**
   * Keys whose blank render comes from the partial's own conditional structure
   * (sections over absent params) — legitimate control flow, exempt from the
   * blank-interpolation check. A statically empty partial is NOT in this set
   * and still fails strict rendering when transcluded.
   */
  conditionallyBlank: Set<string>
}

function resolvePartials(
  declaration: unknown,
  parentContext: Record<string, unknown>,
  context: RenderContext,
  file: string,
): ResolvedPartials {
  const contents: Record<string, string> = {}
  const conditionallyBlank = new Set<string>()
  if (declaration == null) return { contents, conditionallyBlank }
  if (typeof declaration !== 'object' || Array.isArray(declaration)) {
    throw new RenderError(
      'invalid-declaration',
      file,
      '`partials` must be a mapping of key -> file path or glob',
    )
  }

  for (const [key, value] of Object.entries(declaration)) {
    const patterns = Array.isArray(value) ? value : [value]
    const parts: string[] = []
    let conditional = false
    for (const pattern of patterns) {
      if (typeof pattern !== 'string') {
        throw new RenderError(
          'invalid-declaration',
          file,
          `partial "${key}" must be a file path or glob string`,
        )
      }
      for (const partialPath of resolvePartialPaths(pattern, key, context, file)) {
        const rendered = renderPartialFile(partialPath, parentContext, context)
        parts.push(rendered.text)
        conditional ||= rendered.conditional
      }
    }
    const joined = parts.join('\n\n')
    contents[key] = joined
    if (joined.trim() === '' && conditional) conditionallyBlank.add(key)
  }

  return { contents, conditionallyBlank }
}

function resolvePartialPaths(
  pattern: string,
  key: string,
  context: RenderContext,
  file: string,
): string[] {
  // `~/` opts a partial into the shared-partials root (config.ts); everything
  // else resolves against the entry file's directory. Both are jails: the rest
  // of the path may not traverse out of its base.
  let base = context.baseDir
  let path = pattern
  if (pattern.startsWith('~/')) {
    const root = context.partialsRoot()
    if (root === null) {
      throw new RenderError(
        'invalid-declaration',
        file,
        `partial "${key}": "${pattern}" uses the shared-partials prefix "~/" but no partials root is configured — add a .markdown-di.json with { "partialsRoot": "<dir>" } in a directory at or above the template`,
      )
    }
    base = root
    path = pattern.slice(2)
    if (path === '') {
      throw new RenderError(
        'invalid-declaration',
        file,
        `partial "${key}": "~/" needs a path under the partials root`,
      )
    }
  }
  assertPathSafety(path, pattern, key, base, file)

  if (GLOB_MAGIC.test(path)) {
    const matches = context.sources.glob(path, base)
    if (matches.length === 0) {
      throw new RenderError(
        'partial-not-found',
        file,
        `partial "${key}": no files match pattern "${pattern}"`,
      )
    }
    return matches
  }

  const fullPath = join(base, path)
  if (!context.sources.exists(fullPath)) {
    throw new RenderError('partial-not-found', file, `partial "${key}": file not found: ${pattern}`)
  }
  return [fullPath]
}

function assertPathSafety(
  path: string,
  pattern: string,
  key: string,
  baseDir: string,
  file: string,
): void {
  if (path.startsWith('../') || path.includes('/../') || path === '..' || isAbsolute(path)) {
    throw new RenderError(
      'invalid-declaration',
      file,
      `partial "${key}": path traversal not allowed: "${pattern}"`,
    )
  }
  const relativePath = relative(baseDir, normalize(join(baseDir, path)))
  if (relativePath.startsWith('..')) {
    throw new RenderError(
      'invalid-declaration',
      file,
      `partial "${key}": "${pattern}" escapes the template directory`,
    )
  }
}

function renderPartialFile(
  partialPath: string,
  parentContext: Record<string, unknown>,
  context: RenderContext,
): { text: string; conditional: boolean } {
  if (context.visited.has(partialPath)) {
    throw new RenderError(
      'circular-partial',
      partialPath,
      `circular partial inclusion: ${partialPath} is already being rendered`,
    )
  }

  const raw = context.sources.read(partialPath)
  let document: ReturnType<typeof extractFrontmatter>
  try {
    document = extractFrontmatter(raw)
  } catch {
    // mirrors core: partials with unparseable frontmatter are included verbatim
    return { text: raw, conditional: false }
  }
  // mirrors core: plain partials are included verbatim
  if (!document.hasFrontmatter) return { text: raw, conditional: false }

  context.visited.add(partialPath)
  try {
    const resolved = resolveParentReferences(document.frontmatter, parentContext, partialPath)
    const merged: Record<string, unknown> = { ...parentContext, ...resolved }
    const nested = resolvePartials(resolved.partials, merged, context, partialPath)
    merged.partials = nested.contents
    checkTemplate(document.body, [merged], context.declared, partialPath, nested.conditionallyBlank)
    return {
      text: Mustache.render(document.body, merged, {}, MUSTACHE_RENDER_CONFIG),
      conditional: hasSections(document.body),
    }
  } finally {
    context.visited.delete(partialPath)
  }
}

/**
 * Resolve `$parent` / `$parent('key')` references in a partial's frontmatter
 * against the parent document's context. Strict: unresolvable references throw
 * (core records an error and keeps the literal string).
 */
function resolveParentReferences(
  frontmatter: Record<string, unknown>,
  parentContext: Record<string, unknown>,
  file: string,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === 'string') {
      const match = value.match(PARENT_REFERENCE)
      if (match) {
        const parentKey = match[1] || key
        if (!(parentKey in parentContext)) {
          throw new RenderError(
            'unresolved-tag',
            file,
            `$parent reference in "${key}" does not resolve: parent context has no key "${parentKey}"`,
          )
        }
        resolved[key] = parentContext[parentKey]
        continue
      }
    }
    resolved[key] = value
  }
  return resolved
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

/**
 * Walk a template's partial graph and capture every source it touches into a
 * TemplateSnapshot. Runs at build time against the disk (by default); the result
 * is inlined by the bundle loader so the compiled binary can render with no fs.
 */
export function collectSources(filePath: string, sources: Sources = diskSources): TemplateSnapshot {
  const entry = resolve(filePath)
  const files: Record<string, string> = {}
  const globs: Record<string, string[]> = {}
  const partialsRoots: Record<string, string | null> = {}

  // A recorder that delegates to the real resolver and captures every touch.
  const recorder: Sources = {
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
  }

  let sharedRoot: string | null | undefined
  const context: RenderContext = {
    baseDir: dirname(entry),
    partialsRoot: () => {
      if (sharedRoot === undefined) sharedRoot = recorder.partialsRoot(dirname(entry))
      return sharedRoot
    },
    visited: new Set([entry]),
    declared: new Set(),
    sources: recorder,
  }
  collectFrom(entry, context)

  return { entry, files, globs, partialsRoots }
}

// Structural walk mirroring resolvePartials → renderPartialFile, but only to
// discover files (no rendering, no params). The partial file set is static, so
// this reaches exactly what a real render would read.
function collectFrom(path: string, context: RenderContext): void {
  const raw = context.sources.read(path)
  let document: ReturnType<typeof extractFrontmatter>
  try {
    document = extractFrontmatter(raw)
  } catch {
    return // verbatim partial; nothing further to reach
  }
  const declaration = document.frontmatter.partials
  if (!document.hasFrontmatter || declaration == null) return
  if (typeof declaration !== 'object' || Array.isArray(declaration)) {
    throw new RenderError(
      'invalid-declaration',
      path,
      '`partials` must be a mapping of key -> file path or glob',
    )
  }

  for (const [key, value] of Object.entries(declaration)) {
    const patterns = Array.isArray(value) ? value : [value]
    for (const pattern of patterns) {
      if (typeof pattern !== 'string') {
        throw new RenderError(
          'invalid-declaration',
          path,
          `partial "${key}" must be a file path or glob string`,
        )
      }
      for (const partialPath of resolvePartialPaths(pattern, key, context, path)) {
        if (context.visited.has(partialPath)) continue
        context.visited.add(partialPath)
        collectFrom(partialPath, context)
      }
    }
  }
}

/**
 * Rebuild a renderer from a TemplateSnapshot, reading only from the snapshot —
 * no filesystem, no cwd dependence. This is what the bundle loader inlines, so a
 * `.md` import keeps working inside a `bun build --compile` standalone binary.
 */
export function createRendererFromSnapshot(snapshot: TemplateSnapshot): Renderer {
  const memory: Sources = {
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
  return createRenderer(snapshot.entry, memory)
}
