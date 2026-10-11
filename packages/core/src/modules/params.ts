import { RenderError } from './errors'

export type ScalarType = 'string' | 'number' | 'boolean' | 'unknown'

/**
 * A declared param type:
 *
 * - a scalar: `string`, `number`, `boolean` (`unknown` only for `$dynamic` fields)
 * - a list: `string[]` shorthand, or a one-item YAML sequence `[ <type> ]`
 * - a record: a YAML mapping of field name -> type (`field?:` is optional)
 */
export type ParamType =
  | ScalarType
  | { readonly kind: 'list'; readonly item: ParamType }
  | { readonly kind: 'record'; readonly fields: readonly FieldSpec[] }

export interface FieldSpec {
  name: string
  type: ParamType
  required: boolean
}

export interface ParamSpec extends FieldSpec {
  /** 'params' = declared in the `params:` block; 'dynamic' = a top-level `$dynamic` field */
  source: 'params' | 'dynamic'
}

const DECLARED_SCALARS: ReadonlySet<string> = new Set(['string', 'number', 'boolean'])

const SUPPORTED =
  'string | number | boolean, a list (`string[]` or a one-item sequence), or a record (a mapping of field -> type)'

/** Frontmatter fields with structural meaning in markdown-di; params may not shadow them. */
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'params',
  'partials',
  'output-frontmatter',
  'id',
  'schema',
  'export',
])

const DYNAMIC_MARKER = '$dynamic'

/**
 * Derive param declarations from frontmatter. Two conventions are supported:
 *
 * - `params:` block (preferred, typed): `transcript: string`, `attempt?: number`,
 *   `rows: [{ id: string, note?: string }]`
 * - top-level `$dynamic` fields (core's marker): required, untyped
 */
export function parseParamSpecs(frontmatter: Record<string, unknown>, file: string): ParamSpec[] {
  const specs: ParamSpec[] = []
  const seen = new Set<string>()

  const block = frontmatter.params
  if (block !== undefined) {
    if (!isMapping(block)) {
      throw new RenderError(
        'invalid-declaration',
        file,
        '`params` must be a mapping of param name -> type',
      )
    }
    for (const field of parseFields(block, 'param', '', file)) {
      assertUsableName(field.name, frontmatter, file)
      if (seen.has(field.name)) {
        throw new RenderError(
          'invalid-declaration',
          file,
          `param "${field.name}" is declared twice`,
        )
      }
      seen.add(field.name)
      specs.push({ ...field, source: 'params' })
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

function parseFields(
  block: Record<string, unknown>,
  noun: 'param' | 'field',
  prefix: string,
  file: string,
): FieldSpec[] {
  const fields: FieldSpec[] = []
  const seen = new Set<string>()
  for (const [rawName, rawType] of Object.entries(block)) {
    const required = !rawName.endsWith('?')
    const name = (required ? rawName : rawName.slice(0, -1)).trim()
    if (!name) {
      throw new RenderError('invalid-declaration', file, `${noun} declarations need a name`)
    }
    const path = `${prefix}${name}`
    if (seen.has(name)) {
      throw new RenderError('invalid-declaration', file, `${noun} "${path}" is declared twice`)
    }
    seen.add(name)
    fields.push({ name, type: parseType(rawType, noun, path, file), required })
  }
  return fields
}

function parseType(raw: unknown, noun: 'param' | 'field', path: string, file: string): ParamType {
  const unsupported = () =>
    new RenderError(
      'invalid-declaration',
      file,
      `${noun} "${path}" has unsupported type ${JSON.stringify(raw)} — supported: ${SUPPORTED}`,
    )
  if (typeof raw === 'string') {
    let base = raw.trim()
    let depth = 0
    while (base.endsWith('[]')) {
      base = base.slice(0, -2).trimEnd()
      depth++
    }
    if (!DECLARED_SCALARS.has(base)) throw unsupported()
    let type: ParamType = base as ScalarType
    for (let i = 0; i < depth; i++) type = { kind: 'list', item: type }
    return type
  }
  if (Array.isArray(raw)) {
    if (raw.length !== 1) throw unsupported()
    return { kind: 'list', item: parseType(raw[0], 'field', `${path}[]`, file) }
  }
  if (isMapping(raw)) {
    const fields = parseFields(raw, 'field', `${path}.`, file)
    if (fields.length === 0) throw unsupported()
    return { kind: 'record', fields }
  }
  throw unsupported()
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

/** The declared type as written in TypeScript-ish notation, for messages. */
export function describeType(type: ParamType): string {
  if (typeof type === 'string') return type
  if (type.kind === 'list') {
    const item = describeType(type.item)
    return typeof type.item === 'string' || type.item.kind === 'record'
      ? `${item}[]`
      : `(${item})[]`
  }
  const fields = type.fields.map(
    (field) => `${field.name}${field.required ? '' : '?'}: ${describeType(field.type)}`,
  )
  return `{ ${fields.join('; ')} }`
}

/**
 * Validate render-time arguments against the declared params. Throws on
 * undeclared params or fields, missing required params or fields, and type
 * mismatches, naming the full path (`rows[2].verdict`).
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
          `missing required param "${spec.name}" (${describeType(spec.type)})`,
        )
      }
      continue
    }
    checkValue(value, spec.type, spec.name, file)
  }
}

function checkValue(value: unknown, type: ParamType, path: string, file: string): void {
  const wrongType = () =>
    new RenderError(
      'wrong-type',
      file,
      `param "${path}" expected ${describeType(type)}, got ${describeValue(value)}`,
    )
  if (typeof type === 'string') {
    if (!matchesScalar(value, type)) throw wrongType()
    return
  }
  if (type.kind === 'list') {
    if (!Array.isArray(value)) throw wrongType()
    value.forEach((item, index) => {
      checkValue(item, type.item, `${path}[${index}]`, file)
    })
    return
  }
  if (!isMapping(value)) throw wrongType()
  const fieldNames = new Set(type.fields.map((field) => field.name))
  for (const key of Object.keys(value)) {
    if (!fieldNames.has(key)) {
      throw new RenderError(
        'unknown-param',
        file,
        `unknown field "${path}.${key}" — declared fields: ${[...fieldNames].join(', ')}`,
      )
    }
  }
  for (const field of type.fields) {
    const fieldValue = value[field.name]
    if (fieldValue === undefined) {
      if (field.required) {
        throw new RenderError(
          'missing-param',
          file,
          `missing required field "${path}.${field.name}" (${describeType(field.type)})`,
        )
      }
      continue
    }
    checkValue(fieldValue, field.type, `${path}.${field.name}`, file)
  }
}

/**
 * Give every record an own key for each declared field, so an absent optional
 * field resolves to `undefined` inside its section instead of falling through
 * to a same-named key of an outer mustache frame. Returns a copy.
 */
export function normalizeArg(value: unknown, type: ParamType): unknown {
  if (typeof type === 'string' || value == null) return value
  if (type.kind === 'list') {
    return Array.isArray(value) ? value.map((item) => normalizeArg(item, type.item)) : value
  }
  if (!isMapping(value)) return value
  const record: Record<string, unknown> = {}
  for (const field of type.fields) record[field.name] = normalizeArg(value[field.name], field.type)
  return record
}

function matchesScalar(value: unknown, type: ScalarType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'unknown':
      return true
  }
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return typeof value
}
