/**
 * The TypeScript 7.1 content mapper protocol: JSON-RPC 2.0 over stdio with
 * `Content-Length` framing, as TypeScript speaks it to a mapper it spawns. The
 * subset markdown-di uses, after the reference sample at
 * https://github.com/DanielRosenwasser/content-mapper-sample.
 */

export type PositionEncoding = 'utf-8' | 'utf-16'

export interface InitializeParams {
  /** The encodings TypeScript accepts; the mapper picks one for every position it reports. */
  positionEncodings: PositionEncoding[]
  locale?: string
}

export interface InitializeResult {
  positionEncoding: PositionEncoding
  /** Shown as the source of mapper diagnostics (`markdown-di(1001)`). */
  diagnosticSource: string
}

export interface OpenProjectParams {
  /** Absolute tsconfig path, or an empty string for a project without one. */
  configFileName: string
  projectHandle: string
  /** The `options` object of this mapper's `contentMappers` entry. */
  options?: Record<string, unknown>
  compilerOptions: Record<string, unknown>
}

// biome-ignore lint/complexity/noBannedTypes: the protocol's empty result object
export type OpenProjectResult = {}

export interface TransformParams {
  fileName: string
  /** The file's current contents — an editor's unsaved buffer, not necessarily the disk. */
  content: string
  projectHandle: string
}

export interface CloseProjectParams {
  projectHandle: string
}

export const SpanMapKind = {
  /** Same length and content in the original and the virtual text. */
  Verbatim: 0,
  /** Different length or content. */
  Atom: 1,
} as const

export type SpanMapKind = (typeof SpanMapKind)[keyof typeof SpanMapKind]

/** Which language service features may use a span (a bit set; omitted means all). */
export const SpanMapFeature = {
  Hover: 1 << 0,
  Definition: 1 << 3,
  References: 1 << 6,
  DocumentHighlights: 1 << 7,
} as const

/** `[virtualStart, virtualLength, originalStart, originalLength, kind, features?]`, in the chosen encoding. */
export type SpanMapping = [
  virtualStart: number,
  virtualLength: number,
  originalStart: number,
  originalLength: number,
  kind: SpanMapKind,
  features?: number,
]

/** A problem in the original file; `start` and `length` are in the chosen encoding. */
export interface MapperDiagnostic {
  messageText: string
  start: number
  length: number
  code: number
}

export interface TransformResult {
  /** The virtual module TypeScript checks in place of the markdown file. */
  text: string
  extension: '.ts'
  mappings?: SpanMapping[]
  diagnostics?: MapperDiagnostic[]
}
