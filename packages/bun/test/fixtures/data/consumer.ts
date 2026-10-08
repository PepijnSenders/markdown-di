// Compile-check consumer: type-checked by tsc in typegen.test.ts against the
// declarations typegen generates for the data fixtures — once as a single file
// (md-types.d.ts), once as sibling .d.md.ts files.
import approved, { frontmatter, sections } from './process/02-review/approved.gate.md'
import cards from './process/process.md'

// Literal frontmatter types: unions derive straight from the collection.
type CardId = (typeof cards)[number]['frontmatter']['id']
type CardPath = (typeof cards)[number]['path']

const ids: CardId[] = ['n-intake', 'g-approved']
const paths: CardPath[] = ['01-intake/intake.node.md', '02-review/approved.gate.md']

// @ts-expect-error not a card id
const bogus: CardId = 'g-nope'

const kind: 'gate' = approved.frontmatter.kind
const weight: 3 = frontmatter.weight
const routeIds: Array<'ship' | 'rework'> = approved.frontmatter.routes.map((route) => route.id)
const firstRole: 'lead' = approved.frontmatter.roles[0]

// @ts-expect-error a route has no such field
approved.frontmatter.routes[0].nope

// @ts-expect-error data is readonly
approved.frontmatter.id = 'g-other'

// sections are typed structurally
const title: string | null = sections.title
const rowLabels: string[] = sections.rows.map((row) => row.label)
const headings: string[] = cards[1].sections.sections.map((section) => section.heading)
const body: string = cards[0].body

export { body, bogus, firstRole, headings, ids, kind, paths, routeIds, rowLabels, title, weight }
