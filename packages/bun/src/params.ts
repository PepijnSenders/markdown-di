import { RenderError } from './errors'

export type ParamType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'string[]'
  | 'number[]'
  | 'boolean[]'
  | 'unknown'

export interface ParamSpec {
  name: string
  type: ParamType
  required: boolean
  /** 'params' = declared in the `params:` block; 'dynamic' = a top-level `$dynamic` field */
  source: 'params' | 'dynamic'
}

const DECLARED_TYPES: ReadonlySet<string> = new Set([
  'string',
  'number',
  'boolean',
  'string[]',
  'number[]',
  'boolean[]',
])

/** Frontmatter fields with structural meaning in markdown-di; params may not shadow them. */
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'params',
  'partials',
  'output-frontmatter',
  'id',
  'schema',
])

const DYNAMIC_MARKER = '$dynamic'

/**
 * Derive param declarations from frontmatter. Two conventions are supported:
 *
 * - `params:` block (preferred, typed): `transcript: string`, `attempt?: number`
 * - top-level `$dynamic` fields (core's marker): required, untyped
 */
export function parseParamSpecs(frontmatter: Record<string, unknown>, file: string): ParamSpec[] {
  const specs: ParamSpec[] = []
  const seen = new Set<string>()

  const block = frontmatter.params
  if (block !== undefined) {
    if (block === null || typeof block !== 'object' || Array.isArray(block)) {
      throw new RenderError(
        'invalid-declaration',
        file,
        '`params` must be a mapping of param name -> type',
      )
    }
    for (const [rawName, rawType] of Object.entries(block)) {
      const required = !rawName.endsWith('?')
      const name = (required ? rawName : rawName.slice(0, -1)).trim()
      if (!name) {
        throw new RenderError('invalid-declaration', file, 'param declarations need a name')
      }
      if (typeof rawType !== 'string' || !DECLARED_TYPES.has(rawType.trim())) {
        throw new RenderError(
          'invalid-declaration',
          file,
          `param "${name}" has unsupported type ${JSON.stringify(rawType)} — supported: ${[
            ...DECLARED_TYPES,
          ].join(' | ')}`,
        )
      }
      assertUsableName(name, frontmatter, file)
      if (seen.has(name)) {
        throw new RenderError('invalid-declaration', file, `param "${name}" is declared twice`)
      }
      seen.add(name)
      specs.push({ name, type: rawType.trim() as ParamType, required, source: 'params' })
    }
  }

  for (const [name, value] of Object.entries(frontmatter)) {
    if (value !== DYNAMIC_MARKER) continue
    if (RESERVED_NAMES.has(name)) {
      throw new RenderError('invalid-declaration', file, `param name "${name}" is reserved`)
    }
    if (seen.has(name)) {
      throw new RenderError(
        'invalid-declaration',
        file,
        `"${name}" is declared both in \`params\` and as $dynamic`,
      )
    }
    seen.add(name)
    specs.push({ name, type: 'unknown', required: true, source: 'dynamic' })
  }

  return specs
}

function assertUsableName(name: string, frontmatter: Record<string, unknown>, file: string): void {
  if (RESERVED_NAMES.has(name)) {
    throw new RenderError('invalid-declaration', file, `param name "${name}" is reserved`)
  }
  if (Object.hasOwn(frontmatter, name)) {
    throw new RenderError(
      'invalid-declaration',
      file,
      `param "${name}" collides with the frontmatter field of the same name`,
    )
  }
}

/**
 * Validate render-time arguments against the declared params. Throws on
 * undeclared params, missing required params, and type mismatches.
 */
export function validateArgs(
  specs: ParamSpec[],
  args: Record<string, unknown>,
  file: string,
): void {
  const declared = new Set(specs.map((spec) => spec.name))
  for (const key of Object.keys(args)) {
    if (!declared.has(key)) {
      const hint =
        specs.length === 0
          ? 'this template declares no params'
          : `declared params: ${specs.map((spec) => spec.name).join(', ')}`
      throw new RenderError('unknown-param', file, `unknown param "${key}" — ${hint}`)
    }
  }
  for (const spec of specs) {
    const value = args[spec.name]
    if (value === undefined) {
      if (spec.required) {
        throw new RenderError(
          'missing-param',
          file,
          `missing required param "${spec.name}" (${spec.type})`,
        )
      }
      continue
    }
    if (!matchesType(value, spec.type)) {
      throw new RenderError(
        'wrong-type',
        file,
        `param "${spec.name}" expected ${spec.type}, got ${describeValue(value)}`,
      )
    }
  }
}

function matchesType(value: unknown, type: ParamType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'string[]':
      return Array.isArray(value) && value.every((item) => typeof item === 'string')
    case 'number[]':
      return (
        Array.isArray(value) &&
        value.every((item) => typeof item === 'number' && Number.isFinite(item))
      )
    case 'boolean[]':
      return Array.isArray(value) && value.every((item) => typeof item === 'boolean')
    case 'unknown':
      return true
  }
}

function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return typeof value
}
