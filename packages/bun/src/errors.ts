export type RenderErrorCode =
  | 'invalid-declaration'
  | 'unknown-param'
  | 'missing-param'
  | 'wrong-type'
  | 'unresolved-tag'
  | 'unsupported-tag'
  | 'partial-not-found'
  | 'circular-partial'

/**
 * Thrown for every strict-mode violation: bad param declarations, undeclared or
 * missing params, and any tag that would silently render as nothing.
 */
export class RenderError extends Error {
  readonly code: RenderErrorCode
  readonly file: string

  constructor(code: RenderErrorCode, file: string, message: string) {
    super(`${message} (${file})`)
    this.name = 'RenderError'
    this.code = code
    this.file = file
  }
}
