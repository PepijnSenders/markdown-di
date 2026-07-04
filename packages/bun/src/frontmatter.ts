import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'

export interface ExtractedDocument {
  frontmatter: Record<string, unknown>
  body: string
  hasFrontmatter: boolean
}

/**
 * Mirrors @markdown-di/core's FrontmatterProcessor: gray-matter with the `yaml`
 * package as the engine (avoids HTML entity encoding). We cannot import core at
 * runtime because its package entry points at `dist/`, which CI builds only
 * after tests run; parity with core is pinned by test/parity.test.ts instead.
 *
 * Throws when the frontmatter block exists but is not valid YAML.
 */
export function extractFrontmatter(source: string): ExtractedDocument {
  const parsed = matter(source, {
    engines: { yaml: (input: string) => parseYaml(input) },
  })

  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    return { frontmatter: {}, body: source, hasFrontmatter: false }
  }

  return {
    frontmatter: parsed.data as Record<string, unknown>,
    body: parsed.content,
    hasFrontmatter: true,
  }
}
