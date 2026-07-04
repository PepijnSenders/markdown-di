// Compile-check consumer: type-checked by tsc in typegen.test.ts against a
// generated single-file declaration (md-types.d.ts) covering narrate.md and
// plain.md, with the generic fallback appended for notes.md.
import narrate, { type NarrateParams } from './narrate.md'
import notes from './notes.md'
import plain, { frontmatter, source } from './plain.md'

const params: NarrateParams = { factsJson: '{}' }
const narrated: string = narrate(params)
const withTone: string = narrate({ factsJson: '{}', tone: 'dry' })
const plainRendered: string = plain()
const notesRendered: string = notes({ anything: true })

// @ts-expect-error unknown params are rejected by the per-template block
narrate({ factsJson: '{}', bogus: true })

// @ts-expect-error narrate's params are required
narrate()

// @ts-expect-error plain.md declares no params, so render takes none
plain({ nope: true })

export { frontmatter, narrated, notesRendered, plainRendered, source, withTone }
