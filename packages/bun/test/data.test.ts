import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Registers the .md loader; imports below are dynamic so they resolve after
// registration (see loader.test.ts).
import '../src/plugin'
import { markdownDiBundleLoader } from '../src/loader'

const DATA = join(import.meta.dir, 'fixtures', 'data')

describe('data imports (`export: data`)', () => {
  test('a data file imports as { frontmatter, body, sections }', async () => {
    const mod = await import('./fixtures/data/process/02-review/approved.gate.md')
    const card = mod.default
    expect(typeof card).toBe('object')
    expect(Object.keys(card)).toEqual(['frontmatter', 'body', 'sections'])

    // frontmatter is the YAML as written, minus the `export` declaration
    expect(card.frontmatter.id).toBe('g-approved')
    expect(card.frontmatter.roles).toEqual(['lead', 'designer'])
    expect(card.frontmatter.routes[1]).toEqual({
      id: 'rework',
      text: 'rework ↺',
      backTo: 'intake',
    })
    expect('export' in card.frontmatter).toBe(false)

    expect(card.body.startsWith('# approved')).toBe(true)
  })

  test('named exports mirror the default export', async () => {
    const mod = await import('./fixtures/data/process/02-review/approved.gate.md')
    expect(mod.frontmatter).toBe(mod.default.frontmatter)
    expect(mod.body).toBe(mod.default.body)
    expect(mod.sections).toBe(mod.default.sections)
  })

  test('sections: title, category, rows, paragraphs and ## sections with source lines', async () => {
    const { sections } = await import('./fixtures/data/process/02-review/approved.gate.md')
    expect(sections.title).toBe('approved')
    expect(sections.category).toBe('Gate · mandatory · review gate')
    expect(sections.paragraphs).toEqual([
      'The lead decides whether the work ships, with a designer when the UI moved.',
    ])
    expect(sections.rows).toEqual([
      { label: 'Decides', text: 'lead; with a designer when the UI moved', line: 28 },
      { label: 'Ship', text: 'the ticket moves to Done', line: 29 },
      { label: 'Rework', text: 'back to intake', line: 30 },
    ])

    expect(sections.sections.map((section: { heading: string }) => section.heading)).toEqual([
      'Responsibility',
      'Effect: ticket-to-done',
    ])
    const [responsibility, effect] = sections.sections
    expect(responsibility.line).toBe(32)
    expect(responsibility.rows.at(-1)).toEqual({
      label: 'How',
      text: 'The lead reads the review and decides.\nA designer joins when the UI moved.',
      line: 36,
    })

    // A bold lead line may precede the italic category; a fenced block is opaque.
    expect(effect.category).toBe('Effect · ticket state change')
    expect(effect.paragraphs[0]).toBe('**Ticket status: Review → Done**')
    expect(effect.paragraphs[2]).toContain('## not a heading')
    expect(effect.rows).toEqual([])
  })
})

describe('collections (`export: collection`)', () => {
  test('a manifest imports as an array of its members, in path order', async () => {
    const { default: cards } = await import('./fixtures/data/process/process.md')
    expect(Array.isArray(cards)).toBe(true)
    expect(cards.map((card: { path: string }) => card.path)).toEqual([
      '01-intake/intake.node.md',
      '02-review/approved.gate.md',
    ])
  })

  test('members need no `export: data` of their own; README is excluded by the manifest', async () => {
    const { default: cards } = await import('./fixtures/data/process/process.md')
    const intake = cards[0]
    expect(intake.frontmatter).toEqual({
      id: 'n-intake',
      kind: 'node',
      stage: 'intake',
      name: 'intake',
    })
    expect(intake.sections.category).toBe('Node · agent')
    expect(Object.keys(intake)).toEqual(['path', 'frontmatter', 'body', 'sections'])
  })

  test('a member is the same data a direct import yields', async () => {
    const { default: cards } = await import('./fixtures/data/process/process.md')
    const direct = await import('./fixtures/data/process/02-review/approved.gate.md')
    expect({ ...cards[1], path: undefined }).toEqual({ ...direct.default, path: undefined })
  })
})

describe('strictness', () => {
  const failure = async (file: string): Promise<Error> => {
    try {
      await import(join(DATA, 'broken', file))
    } catch (error) {
      return error as Error
    }
    throw new Error(`expected importing ${file} to fail`)
  }

  test('malformed YAML fails with file:line', async () => {
    const error = await failure('bad-yaml.md')
    expect(error.message).toContain('invalid YAML frontmatter')
    expect(error.message).toContain(`${join(DATA, 'broken', 'bad-yaml.md')}:5)`)
  })

  test('a duplicate key fails with the line of the duplicate', async () => {
    const error = await failure('duplicate-key.md')
    expect(error.message).toContain('Map keys must be unique')
    expect(error.message).toContain('duplicate-key.md:5)')
  })

  test('an unknown `export` value fails with the line of the key', async () => {
    const error = await failure('bad-export.md')
    expect(error.message).toContain(
      '`export` must be one of render | data | collection, got "json"',
    )
    expect(error.message).toContain('bad-export.md:3)')
  })

  test('a collection that matches nothing fails', async () => {
    const error = await failure('empty-collection.md')
    expect(error.message).toContain('collection matches no files')
  })

  test('a collection member that declares another export kind fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-di-collection-'))
    try {
      writeFileSync(join(dir, 'all.md'), '---\nexport: collection\ninclude: "*.md"\n---\n')
      writeFileSync(
        join(dir, 'nested.md'),
        '---\nid: x\nexport: collection\ninclude: "*.md"\n---\n',
      )
      let error: Error | undefined
      try {
        await import(join(dir, 'all.md'))
      } catch (caught) {
        error = caught as Error
      }
      expect(error?.message).toContain('declares `export: collection`')
      expect(error?.message).toContain('nested.md:3)')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('bundle loader (bun build)', () => {
  test('data and collection modules bundle as plain literals that run without the loader', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-di-data-bundle-'))
    try {
      const entry = join(dir, 'entry.ts')
      writeFileSync(
        entry,
        [
          `import cards from '${join(DATA, 'process/process.md')}'`,
          `import approved, { sections } from '${join(DATA, 'process/02-review/approved.gate.md')}'`,
          'export const ids = cards.map((card) => card.frontmatter.id)',
          'export const title = sections.title',
          'export const kind = approved.frontmatter.kind',
        ].join('\n'),
      )
      const result = await Bun.build({
        entrypoints: [entry],
        plugins: [markdownDiBundleLoader],
        target: 'bun',
        outdir: join(dir, 'out'),
      })
      expect(result.success).toBe(true)
      const js = await result.outputs[0].text()
      // Data needs no runtime helper (and the raw markdown was not turned into HTML).
      expect(js).not.toContain('@markdown-di')
      expect(js).not.toContain('<h1>')

      const bundled = await import(result.outputs[0].path)
      expect(bundled.ids).toEqual(['n-intake', 'g-approved'])
      expect(bundled.title).toBe('approved')
      expect(bundled.kind).toBe('gate')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
