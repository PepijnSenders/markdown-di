import Mustache from 'mustache'
import { RenderError } from './errors'

/** A mustache parse-tree token: [type, name, start, end, subTokens?, ...]. */
type Token = [string, string, number, number, Token[]?, ...unknown[]]

/**
 * Walk the mustache parse tree of a template and throw before rendering if any
 * tag would silently produce nothing:
 *
 * - `{{name}}` / `{{{name}}}` must resolve to a non-nullish, non-blank value
 * - `{{#section}}` / `{{^section}}` names must at least be declared (a falsy
 *   section value is legitimate control flow and is allowed)
 * - `{{> partial}}` (native mustache partials) are rejected outright — partials
 *   are declared in frontmatter and referenced as `{{partials.key}}`
 *
 * Resolution mirrors mustache's Context.lookup: dotted names must fully resolve
 * within a single context frame; lookups fall through the frame stack.
 */
export function checkTemplate(
  template: string,
  contextStack: unknown[],
  declaredParams: ReadonlySet<string>,
  file: string,
  allowedBlankPartials: ReadonlySet<string> = EMPTY_SET,
): void {
  const tokens = Mustache.parse(template) as unknown as Token[]
  walkTokens(tokens, contextStack, declaredParams, file, allowedBlankPartials)
}

const EMPTY_SET: ReadonlySet<string> = new Set()

/** True when the template contains any section / inverted-section tokens. */
export function hasSections(template: string): boolean {
  const containsSection = (tokens: Token[]): boolean =>
    tokens.some(
      (token) => token[0] === '#' || token[0] === '^' || containsSection(token[4] ?? []),
    )
  return containsSection(Mustache.parse(template) as unknown as Token[])
}

function walkTokens(
  tokens: Token[],
  stack: unknown[],
  declared: ReadonlySet<string>,
  file: string,
  allowedBlankPartials: ReadonlySet<string>,
): void {
  for (const token of tokens) {
    const [type, name] = token
    switch (type) {
      case 'text':
      case '!':
        break
      case '>':
        throw new RenderError(
          'unsupported-tag',
          file,
          `mustache partial "{{> ${name}}}" is not supported — declare it under \`partials:\` in frontmatter and reference it as {{partials.${name}}}`,
        )
      case 'name':
      case '&': {
        const hit = lookup(name, stack)
        if (!hit.found) {
          if (isDeclaredName(name, declared)) {
            throw new RenderError(
              'unresolved-tag',
              file,
              `{{${name}}} would render as nothing: optional param "${rootSegment(name)}" was not provided`,
            )
          }
          throw new RenderError(
            'unresolved-tag',
            file,
            `{{${name}}} does not resolve to anything — not a frontmatter field, declared param, or partial`,
          )
        }
        if (typeof hit.value === 'function') break // lambda: evaluated at render time
        // A partial whose blankness comes from its own conditional structure
        // (its body is sections over absent params) is control flow, not a
        // silent bug — resolvePartials marks those keys as allowed-blank. A
        // statically empty partial file still throws below.
        if (
          rootSegment(name) === 'partials' &&
          allowedBlankPartials.has(name.split('.').slice(1).join('.'))
        ) {
          break
        }
        if (hit.value == null || (typeof hit.value === 'string' && hit.value.trim() === '')) {
          throw new RenderError(
            'unresolved-tag',
            file,
            `{{${name}}} would render as nothing (resolved to ${describeNothing(hit.value)})`,
          )
        }
        break
      }
      case '#': {
        const hit = lookup(name, stack)
        if (!hit.found && !isDeclaredName(name, declared)) {
          throw new RenderError(
            'unresolved-tag',
            file,
            `section {{#${name}}} does not resolve — not a frontmatter field or declared param`,
          )
        }
        const value = hit.found ? hit.value : undefined
        const children = token[4] ?? []
        if (typeof value === 'function') break
        if (!value || (Array.isArray(value) && value.length === 0)) break // intentional no-op
        if (Array.isArray(value)) {
          for (const item of value) {
            walkTokens(children, [...stack, item], declared, file, allowedBlankPartials)
          }
        } else {
          walkTokens(children, [...stack, value], declared, file, allowedBlankPartials)
        }
        break
      }
      case '^': {
        const hit = lookup(name, stack)
        if (!hit.found && !isDeclaredName(name, declared)) {
          throw new RenderError(
            'unresolved-tag',
            file,
            `inverted section {{^${name}}} does not resolve — not a frontmatter field or declared param`,
          )
        }
        const value = hit.found ? hit.value : undefined
        if (!value || (Array.isArray(value) && value.length === 0)) {
          walkTokens(token[4] ?? [], stack, declared, file, allowedBlankPartials)
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

function isDeclaredName(name: string, declared: ReadonlySet<string>): boolean {
  return declared.has(rootSegment(name))
}

function rootSegment(name: string): string {
  return name.split('.')[0]
}

function describeNothing(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  return 'a blank string'
}
