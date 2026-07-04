import Mustache from 'mustache'
import type { ValidationError } from './types'
import { positionAt } from './validator'

/** A mustache parse-tree token: [type, name, start, end, subTokens?, ...]. */
type MustacheToken = [string, string, number, number, MustacheToken[]?, ...unknown[]]

/**
 * Options for strict template checking
 */
export interface StrictCheckOptions {
  /**
   * Custom delimiters, e.g. ['<%', '%>']
   */
  tags?: [string, string]
  /**
   * Line offset of the template relative to its source file (frontmatter block)
   */
  lineOffset?: number
  /**
   * Location prefix for reported errors (e.g. the partial's file path).
   * Falls back to a bare "line N" location.
   */
  file?: string
}

/**
 * Walk the Mustache parse tree of a template against its view and report every
 * `{{variable}}`, `{{#section}}` or `{{^section}}` that references a key absent
 * from the view. Used by strict mode (ProcessOptions.strict) so typo'd
 * variables error instead of silently rendering as an empty string.
 *
 * Section contents are checked against the pushed context frames, mirroring
 * Mustache's own Context.lookup: dotted names must fully resolve within a
 * single frame; lookups fall through the frame stack.
 */
export function checkTemplateStrict(
  template: string,
  view: Record<string, unknown>,
  options: StrictCheckOptions = {},
): ValidationError[] {
  const errors: ValidationError[] = []
  let tokens: MustacheToken[]
  try {
    tokens = Mustache.parse(template, options.tags) as unknown as MustacheToken[]
  } catch {
    // Syntax errors are reported separately by PartialValidator
    return errors
  }

  const seen = new Set<string>()
  const report = (name: string, start: number, message: string) => {
    const key = `${name}@${start}`
    if (seen.has(key)) return
    seen.add(key)
    const { line, column } = positionAt(template, start)
    const sourceLine = line + (options.lineOffset ?? 0)
    errors.push({
      type: 'injection',
      message,
      location: options.file
        ? `${options.file}:${sourceLine}:${column}`
        : `line ${sourceLine}, column ${column}`,
    })
  }

  walkTokens(tokens, [view], report)
  return errors
}

type Reporter = (name: string, start: number, message: string) => void

function walkTokens(tokens: MustacheToken[], stack: unknown[], report: Reporter): void {
  for (const token of tokens) {
    const [type, name, start] = token
    switch (type) {
      case 'name':
      case '&': {
        if (!lookup(name, stack).found) {
          report(name, start, `Strict mode: {{${name}}} does not resolve to a key in the view`)
        }
        break
      }
      case '>': {
        report(
          name,
          start,
          `Strict mode: native Mustache partial {{> ${name}}} is not supported — declare it under partials: in frontmatter and reference it as {{partials.${name}}}`,
        )
        break
      }
      case '#': {
        const hit = lookup(name, stack)
        if (!hit.found) {
          report(
            name,
            start,
            `Strict mode: section {{#${name}}} does not resolve to a key in the view`,
          )
          break
        }
        const children = token[4] ?? []
        const value = hit.value
        if (typeof value === 'function') break // lambda: evaluated at render time
        if (Array.isArray(value)) {
          for (const item of value) {
            walkTokens(children, [...stack, item], report)
          }
        } else if (value) {
          walkTokens(children, [...stack, value], report)
        }
        break
      }
      case '^': {
        const hit = lookup(name, stack)
        if (!hit.found) {
          report(
            name,
            start,
            `Strict mode: inverted section {{^${name}}} does not resolve to a key in the view`,
          )
          break
        }
        const value = hit.value
        if (!value || (Array.isArray(value) && value.length === 0)) {
          walkTokens(token[4] ?? [], stack, report)
        }
        break
      }
      default:
        break
    }
  }
}

function lookup(name: string, stack: unknown[]): { found: boolean; value?: unknown } {
  if (name === '.') return { found: true, value: stack[stack.length - 1] }
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i]
    if (frame == null) continue
    if (name.includes('.')) {
      const segments = name.split('.')
      let value: unknown = frame
      let hit = false
      for (let j = 0; value != null && j < segments.length; j++) {
        if (j === segments.length - 1) hit = hasProperty(value, segments[j])
        value = getProperty(value, segments[j])
      }
      if (hit) return { found: true, value }
    } else if (hasProperty(frame, name)) {
      return { found: true, value: getProperty(frame, name) }
    }
  }
  return { found: false }
}

function hasProperty(value: unknown, key: string): boolean {
  if (value == null) return false
  if (typeof value === 'object') return key in (value as object)
  return Object.hasOwn(Object(value), key)
}

function getProperty(value: unknown, key: string): unknown {
  if (value == null) return undefined
  return (value as Record<string, unknown>)[key]
}
