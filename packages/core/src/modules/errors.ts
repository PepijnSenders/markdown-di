export type RenderErrorCode =
  | 'invalid-frontmatter'
  | 'invalid-declaration'
  | 'unknown-param'
  | 'missing-param'
  | 'wrong-type'
  | 'unresolved-tag'
  | 'unsupported-tag'
  | 'partial-not-found'
  | 'circular-partial'

/**
 * Thrown for every strict-mode violation: malformed frontmatter, bad param or
 * module declarations, undeclared or missing params, and any tag that would
 * silently render as nothing.
 *
 * When the problem has a source position, `line` is set and the message ends
 * in `(file:line)`; otherwise it ends in `(file)`.
 */
export class RenderError extends Error {
  readonly code: RenderErrorCode
  readonly file: string
  readonly line: number | undefined

  constructor(code: RenderErrorCode, file: string, message: string, line?: number) {
    super(`${message} (${line === undefined ? file : `${file}:${line}`})`)
    this.name = 'RenderError'
    this.code = code
    this.file = file
    this.line = line
  }
}
