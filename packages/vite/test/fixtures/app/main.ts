// Fixture entry: one of each import kind. Built by plugin.test.ts in dev and
// build mode; the exports are what the tests assert on.
import approved, { sections } from './process/02-review/approved.gate.md'
import cards from './process/process.md'
import greet, { frontmatter as greetFrontmatter } from './prompts/greet.md'

export const greeting = greet({ name: 'Ada' })
export const greetingWithTone = greet({ name: 'Ada', tone: 'dry' })
export const greetTitle = greetFrontmatter.title

export const strictError = (() => {
  try {
    // a missing required param throws at render time, in the browser too
    greet({} as { name: string })
    return null
  } catch (error) {
    return (error as Error).message
  }
})()

export const cardIds = cards.map((card) => card.frontmatter.id)
export const cardPaths = cards.map((card) => card.path)
export const approvedTitle = sections.title
export const approvedCategory = approved.sections.category
export const approvedRows = approved.sections.rows.map((row) => row.label)
export const approvedRoles = approved.frontmatter.roles
