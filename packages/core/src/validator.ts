import Mustache from 'mustache'
import type { ValidationError } from './types'

/** A mustache parse-tree token: [type, name, start, end, subTokens?, ...]. */
type MustacheToken = [string, string, number, number, MustacheToken[]?, ...unknown[]]

/**
 * Options for template syntax validation
 */
export interface ValidateSyntaxOptions {
  /**
   * Custom delimiters, e.g. ['<%', '%>']. Defaults to Mustache's {{ }}.
   */
  tags?: [string, string]
  /**
   * Number of lines the validated body is offset from the start of the source
   * file (i.e. the frontmatter block). Used so reported line numbers are
   * relative to the source file, not the extracted body.
   */
  lineOffset?: number
}

/**
 * Validates template syntax in markdown content using Mustache's own parser,
 * so the library's transclusion syntax ({{partials.key}}, {{{unescaped}}},
 * sections, custom delimiters) is understood natively.
 */
export class PartialValidator {
  validate(content: string, options: ValidateSyntaxOptions = {}): ValidationError[] {
    const { tags, lineOffset = 0 } = options
    const errors: ValidationError[] = []

    let tokens: MustacheToken[]
    try {
      tokens = Mustache.parse(content, tags) as unknown as MustacheToken[]
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Mustache error messages end with the character offset: "Unclosed tag at 22"
      const offsetMatch = /\bat (\d+)$/.exec(message)
      const offset = offsetMatch ? Number(offsetMatch[1]) : 0
      const { line, column } = positionAt(content, offset)
      errors.push({
        type: 'syntax',
        message: `Invalid template syntax: ${message.replace(/\bat \d+$/, '').trim()}`,
        location: `line ${line + lineOffset}, column ${column}`,
      })
      return errors
    }

    this.checkTokens(tokens, content, lineOffset, errors)
    return errors
  }

  private checkTokens(
    tokens: MustacheToken[],
    content: string,
    lineOffset: number,
    errors: ValidationError[],
  ): void {
    for (const token of tokens) {
      const [type, name, start] = token
      if (type === 'text' || type === '!' || type === '=') continue

      const { line, column } = positionAt(content, start)
      const location = `line ${line + lineOffset}, column ${column}`

      if (!name.trim()) {
        errors.push({
          type: 'syntax',
          message: 'Empty tag reference',
          location,
        })
      } else if (/[{}]/.test(name)) {
        errors.push({
          type: 'syntax',
          message: `Invalid characters in partial reference: "${name}"`,
          location,
        })
      }

      const children = token[4]
      if (Array.isArray(children)) {
        this.checkTokens(children, content, lineOffset, errors)
      }
    }
  }
}

/**
 * Convert a character offset into a 1-based line and 0-based column
 */
export function positionAt(content: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, content.length))
  const before = content.slice(0, clamped)
  const lastNewline = before.lastIndexOf('\n')
  return {
    line: before.split('\n').length,
    column: lastNewline === -1 ? clamped : clamped - lastNewline - 1,
  }
}
