import { describe, expect, test } from 'bun:test'
import { emitModule } from '../../src/modules/codegen'
import { RenderError } from '../../src/modules/errors'
import { loadModule } from '../../src/modules/module'
import { dirname, join, normalize, relative } from '../../src/modules/path'
import {
  collectSources,
  createRenderer,
  createRendererFromSnapshot,
} from '../../src/modules/render'
import { rebaseSnapshot, type Sources } from '../../src/modules/sources'

/**
 * An in-memory filesystem: the module engine never touches the disk itself,
 * which is what lets it run in a browser bundle.
 */
function memory(files: Record<string, string>, sharedRoot: string | null = null): Sources {
  return {
    read: (path) => {
      if (!(path in files)) throw new Error(`ENOENT ${path}`)
      return files[path]
    },
    exists: (path) => path in files,
    glob: (pattern, cwd) => {
      const regex = new RegExp(
        `^${pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*\//g, '\0')
          .replace(/\*/g, '[^/]*')
          .replace(/\0/g, '(?:.*/)?')}$`,
      )
      return Object.keys(files)
        .filter((path) => path.startsWith(`${cwd}/`) && regex.test(relative(cwd, path)))
        .sort()
    },
    partialsRoot: () => sharedRoot,
  }
}

const FILES = {
  '/app/prompts/hello.md':
    '---\nparams:\n  name: string\npartials:\n  foot: foot.md\n---\nHi {{name}}. {{partials.foot}}',
  '/app/prompts/foot.md': 'Bye.',
  '/app/cards/index.md': '---\nexport: collection\ninclude: "**/*.md"\nexclude: [drafts/**]\n---\n',
  '/app/cards/b/two.md': '---\nexport: data\nid: two\n---\n# Two\n',
  '/app/cards/a/one.md': '---\nid: one\n---\n# One\n\n_Card_\n',
  '/app/cards/drafts/wip.md': '---\nid: wip\n---\n',
  '/app/cards/data.md': '---\nexport: data\nid: d\nlist: [1, 2]\n---\n\n# D\n\n- **K:** v\n',
}

describe('module kinds', () => {
  const sources = memory(FILES)

  test('a template is `render`', () => {
    expect(loadModule('/app/prompts/hello.md', sources)).toEqual({
      kind: 'render',
      path: '/app/prompts/hello.md',
    })
  })

  test('`export: data` loads frontmatter, trimmed body and sections', () => {
    const loaded = loadModule('/app/cards/data.md', sources)
    expect(loaded.kind).toBe('data')
    if (loaded.kind !== 'data') return
    expect(loaded.data.frontmatter).toEqual({ id: 'd', list: [1, 2] })
    expect(loaded.data.body).toBe('# D\n\n- **K:** v')
    expect(loaded.data.sections.title).toBe('D')
    expect(loaded.data.sections.rows).toEqual([{ label: 'K', text: 'v', line: 9 }])
  })

  test('`export: collection` loads members in path order, honoring exclude', () => {
    const loaded = loadModule('/app/cards/index.md', sources)
    expect(loaded.kind).toBe('collection')
    if (loaded.kind !== 'collection') return
    expect(loaded.entries.map((entry) => [entry.path, entry.frontmatter.id])).toEqual([
      ['a/one.md', 'one'],
      ['b/two.md', 'two'],
      ['data.md', 'd'],
    ])
    expect(loaded.entries[0].sections.category).toBe('Card')
    expect(loaded.files[0]).toBe('/app/cards/index.md')
  })

  test('collection patterns may not leave the manifest directory', () => {
    const sources = memory({
      '/app/x/index.md': '---\nexport: collection\ninclude: ../**/*.md\n---\n',
    })
    expect(() => loadModule('/app/x/index.md', sources)).toThrow(
      "must stay inside the manifest's directory",
    )
  })

  test('a collection manifest takes only include and exclude', () => {
    const sources = memory({
      '/app/x/index.md': '---\nexport: collection\ninclude: "*.md"\ntitle: nope\n---\n',
    })
    let error: unknown
    try {
      loadModule('/app/x/index.md', sources)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(RenderError)
    expect((error as RenderError).line).toBe(4)
    expect((error as RenderError).message).toContain('unknown key "title"')
  })
})

describe('emitModule', () => {
  const sources = memory(FILES)

  test('data emits a plain object literal with no imports', () => {
    const { code, files, kind } = emitModule('/app/cards/data.md', sources, { runtime: 'rt' })
    expect(kind).toBe('data')
    expect(code).not.toContain('import')
    expect(code).toContain('export const sections = data.sections')
    expect(files).toEqual(['/app/cards/data.md'])
  })

  test('a template inlines a snapshot of itself and its partials', () => {
    const { code, files } = emitModule('/app/prompts/hello.md', sources, { runtime: 'my-runtime' })
    expect(code).toContain('from "my-runtime"')
    expect(files.sort()).toEqual(['/app/prompts/foot.md', '/app/prompts/hello.md'])
  })

  test('the snapshot renders identically to the live renderer', () => {
    const live = createRenderer('/app/prompts/hello.md', sources).render({ name: 'Ada' })
    const snapshot = collectSources('/app/prompts/hello.md', sources)
    expect(createRendererFromSnapshot(snapshot).render({ name: 'Ada' })).toBe(live)
    expect(live).toBe('Hi Ada. Bye.')
  })
})

describe('rebaseSnapshot', () => {
  const sources = memory(
    {
      '/home/me/app/src/prompts/page.md':
        '---\npartials:\n  rules: ~/rules/*.md\n  local: parts/intro.md\n---\n{{partials.local}} {{partials.rules}}',
      '/home/me/app/src/prompts/parts/intro.md': 'Intro.',
      '/home/me/app/shared/rules/one.md': 'One.',
      '/home/me/app/shared/rules/two.md': 'Two.',
    },
    '/home/me/app/shared',
  )
  const entry = '/home/me/app/src/prompts/page.md'
  const live = createRenderer(entry, sources).render()

  test('roots every path at the given root and renders identically', () => {
    const snapshot = rebaseSnapshot(collectSources(entry, sources), '/home/me/app/src')
    // shared/ is outside src/, so the base widens to their common ancestor
    expect(snapshot.entry).toBe('/src/prompts/page.md')
    expect(Object.keys(snapshot.files).sort()).toEqual([
      '/shared/rules/one.md',
      '/shared/rules/two.md',
      '/src/prompts/page.md',
      '/src/prompts/parts/intro.md',
    ])
    expect(JSON.stringify(snapshot)).not.toContain('/home/me')
    expect(createRendererFromSnapshot(snapshot).render()).toBe(live)
    expect(live).toBe('Intro. One.\n\nTwo.')
  })

  test('emitModule rebases when given a root', () => {
    const { code } = emitModule(entry, sources, { runtime: 'rt', root: '/home/me/app' })
    expect(code).not.toContain('/home/me')
    expect(code).toContain('"/src/prompts/page.md"')
  })
})

describe('path helpers (browser-safe)', () => {
  test('normalize, join, dirname, relative', () => {
    expect(normalize('/a/b/../c/./d')).toBe('/a/c/d')
    expect(normalize('C:\\work\\a\\..\\b')).toBe('C:/work/b')
    expect(join('/a', 'b', '../c')).toBe('/a/c')
    expect(dirname('/a/b/c.md')).toBe('/a/b')
    expect(dirname('/c.md')).toBe('/')
    expect(relative('/a/b', '/a/b/c/d.md')).toBe('c/d.md')
    expect(relative('/a/b', '/a/x.md')).toBe('../x.md')
  })
})
