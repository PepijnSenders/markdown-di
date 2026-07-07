import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { markdownDiBundleLoader } from '../src/loader'
import { collectSources, createRenderer, createRendererFromSnapshot } from '../src/render'

const FIXTURES = join(import.meta.dir, 'fixtures')

// The bundle path (collectSources → snapshot → createRendererFromSnapshot) must
// render byte-for-byte identically to the disk path (createRenderer), for every
// template shape: partials + $parent, shared `~/` roots, globs, dynamic params,
// and frontmatter-less files. Equivalence here is what guarantees a compiled
// binary renders exactly like `bun run`.
const CASES: Array<{ name: string; file: string; args?: Record<string, unknown> }> = [
  {
    name: 'partials + $parent',
    file: 'prompts/compile-brief.md',
    args: { transcript: 'We need cheaper vouchers.', productName: 'Jig', attempt: 2 },
  },
  { name: 'frontmatter-less, verbatim', file: 'static.md' },
  { name: 'dynamic param', file: 'prompts/dynamic-style.md', args: { transcript: 'hello' } },
  {
    name: 'shared `~/` root + file-local partial',
    file: 'shared-root/workflows/a/prompt.md',
    args: { topic: 'Roots' },
  },
  {
    name: 'config discovered up multiple levels + nested `~/`',
    file: 'shared-root/workflows/b/deep/prompt.md',
  },
  { name: 'glob under the shared root', file: 'shared-root/workflows/c/prompt.md' },
]

describe('bundle snapshot renderer', () => {
  for (const { name, file, args } of CASES) {
    test(`renders identically to the disk renderer: ${name}`, () => {
      const path = join(FIXTURES, file)
      const fromDisk = createRenderer(path).render(args)
      const fromSnapshot = createRendererFromSnapshot(collectSources(path)).render(args)
      expect(fromSnapshot).toBe(fromDisk)
    })
  }

  test('named exports match the disk renderer', () => {
    const path = join(FIXTURES, 'prompts/compile-brief.md')
    const disk = createRenderer(path)
    const snap = createRendererFromSnapshot(collectSources(path))
    expect(snap.frontmatter).toEqual(disk.frontmatter)
    expect(snap.source).toBe(disk.source)
  })

  test('strict errors still throw through the snapshot renderer', () => {
    const path = join(FIXTURES, 'prompts/compile-brief.md')
    const { render } = createRendererFromSnapshot(collectSources(path))
    expect(() => render({ transcript: 't' })).toThrow('missing required param "productName"')
  })

  test('a snapshot is self-contained: it captures the entry and every partial', () => {
    const path = join(FIXTURES, 'prompts/compile-brief.md')
    const snapshot = collectSources(path)
    expect(snapshot.entry).toBe(path)
    // entry + at least one partial captured
    expect(Object.keys(snapshot.files).length).toBeGreaterThan(1)
    expect(snapshot.files[path]).toContain('name: compile-brief')
  })

  test('the bundle loader emits real JS (not a live object) that inlines the snapshot', async () => {
    const path = join(FIXTURES, 'prompts/compile-brief.md')
    const result = await Bun.build({
      entrypoints: [path],
      plugins: [markdownDiBundleLoader],
      target: 'bun',
    })
    expect(result.success).toBe(true)
    const js = await result.outputs[0].text()
    expect(js).toContain('createRendererFromSnapshot')
    // the raw template travels as data; it must NOT have been turned into HTML
    // by Bun's built-in .md loader
    expect(js).not.toContain('<p>')
  })
})
