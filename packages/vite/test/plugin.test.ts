import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createRenderer } from '@markdown-di/core/modules'
import { diskSources } from '@markdown-di/core/modules/node'
import { build, createLogger, createServer, type InlineConfig, type ViteDevServer } from 'vite'
import markdownDi from '../src/index'

const FIXTURE = join(import.meta.dir, 'fixtures', 'app')
const PACKAGES = resolve(import.meta.dir, '..', '..')

// The generated modules import `@markdown-di/vite/runtime`, which in a real app
// resolves to this package's dist/. Point it (and core) at source so the suite
// needs no build — the same thing the root tsconfig `paths` do for Bun.
const alias = [
  { find: /^@markdown-di\/vite\/runtime$/, replacement: join(PACKAGES, 'vite/src/runtime.ts') },
  {
    find: /^@markdown-di\/core\/modules$/,
    replacement: join(PACKAGES, 'core/src/modules/index.ts'),
  },
]

// Templates must render exactly as the disk renderer (the Bun loader) does.
const greet = createRenderer(join(FIXTURE, 'prompts/greet.md'), diskSources)

const EXPECTED = {
  greeting: greet.render({ name: 'Ada' }),
  greetingWithTone: greet.render({ name: 'Ada', tone: 'dry' }),
  greetTitle: 'Greeting',
  cardIds: ['n-intake', 'g-approved'],
  cardPaths: ['01-intake/intake.node.md', '02-review/approved.gate.md'],
  approvedTitle: 'approved',
  approvedCategory: 'Gate · mandatory',
  approvedRows: ['Ship', 'Rework'],
  approvedRoles: ['lead', 'designer'],
}

function config(root: string, extra: InlineConfig = {}): InlineConfig {
  return {
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [markdownDi()],
    resolve: { alias },
    ...extra,
  }
}

describe('vite build', () => {
  const warnings: string[] = []
  let code = ''

  beforeAll(async () => {
    const logger = createLogger('warn')
    logger.warn = (message) => warnings.push(message)
    logger.warnOnce = (message) => warnings.push(message)

    const output = await build(
      config(FIXTURE, {
        logLevel: 'warn',
        customLogger: logger,
        build: {
          write: false,
          minify: false,
          lib: { entry: 'main.ts', formats: ['iife'], name: 'fixture', fileName: 'main' },
        },
      }),
    )
    const result = Array.isArray(output) ? output[0] : output
    if (!('output' in result)) throw new Error('expected a build result, not a watcher')
    code = result.output[0].code
  })

  test('the bundle runs in a bare JS context — no Node globals, no filesystem', () => {
    // A fresh vm context has no process, Buffer, require or fs: what runs here
    // runs in a browser.
    const exports = runInNewContext(`${code}\n;fixture`, {})
    expect({ ...exports, strictError: undefined }).toEqual({ ...EXPECTED, strictError: undefined })
    expect(exports.strictError).toContain('missing required param "name"')
  })

  test('the bundle pulls in no Node built-ins', () => {
    expect(code).not.toMatch(/\bfrom\s*["']node:/)
    expect(code).not.toContain('require(')
    expect(warnings.join('\n')).not.toContain('externalized for browser compatibility')
  })

  test('data compiles to literals; the template carries its partials as a snapshot', () => {
    expect(code).toContain('"g-approved"')
    expect(code).toContain("Signed, {{who}}'s assistant.")
    // snapshot paths are rooted at the project root, not the build machine's disk
    expect(code).toContain('"/prompts/partials/sign-off.md"')
    expect(code).not.toContain(FIXTURE)
    // the raw markdown is never handed to Vite as anything but our module
    expect(code).not.toContain('<h1>')
  })

  test('a strict-mode problem fails the build with file:line', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'markdown-di-vite-broken-')))
    try {
      writeFileSync(join(dir, 'main.ts'), "import card from './card.md'\nexport default card\n")
      writeFileSync(join(dir, 'card.md'), '---\nexport: data\nid: one\nid: two\n---\n# card\n')
      let error: Error | undefined
      try {
        await build(
          config(dir, {
            build: { write: false, lib: { entry: 'main.ts', formats: ['es'], fileName: 'main' } },
          }),
        )
      } catch (caught) {
        error = caught as Error
      }
      expect(error?.message).toContain('Map keys must be unique')
      expect(error?.message).toContain(`${join(dir, 'card.md')}:4`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('vite dev server', () => {
  let dir: string
  let server: ViteDevServer

  beforeAll(async () => {
    // A private copy: these tests edit files.
    // realpath: Vite keys modules by real path (macOS tmpdir is a symlink).
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'markdown-di-vite-dev-')))
    cpSync(FIXTURE, dir, { recursive: true })
    server = await createServer(
      config(dir, { server: { middlewareMode: true, hmr: false }, appType: 'custom' }),
    )
  })

  afterAll(async () => {
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  })

  test('serves the same module semantics as the build', async () => {
    const mod = await server.ssrLoadModule('/main.ts')
    expect({ ...mod, strictError: undefined }).toEqual({ ...EXPECTED, strictError: undefined })
  })

  test('client transforms: a template imports the runtime; data imports nothing', async () => {
    const template = await server.transformRequest('/prompts/greet.md')
    expect(template?.code).toContain('createRendererFromSnapshot')

    const data = await server.transformRequest('/process/02-review/approved.gate.md')
    expect(data?.code).not.toContain('import ')
    expect(data?.code).toContain('"g-approved"')
  })

  test('queries the plugin does not own (?raw) are left to Vite', async () => {
    const raw = await server.transformRequest('/prompts/greet.md?raw')
    expect(raw?.code).toContain('export default')
    expect(raw?.code).toContain('partials:')
    expect(raw?.code).not.toContain('createRendererFromSnapshot')
  })

  test('editing a partial invalidates the template compiled from it', async () => {
    const id = join(dir, 'prompts/greet.md')
    await server.transformRequest('/prompts/greet.md')
    const before = server.moduleGraph.getModuleById(id)
    expect(before?.transformResult).not.toBeNull()

    const partial = join(dir, 'prompts/partials/sign-off.md')
    writeFileSync(partial, "---\nwho: $parent('name')\n---\n\nCheers, {{who}}.\n")
    const plugin = server.config.plugins.find((p) => p.name === '@markdown-di/vite')
    const hook = plugin?.handleHotUpdate
    const handler = typeof hook === 'function' ? hook : hook?.handler
    const modules = await handler?.call({} as never, {
      file: partial,
      timestamp: Date.now(),
      modules: [],
      read: async () => '',
      server,
    })
    expect(modules?.map((module) => module.id)).toEqual([id])
    expect(server.moduleGraph.getModuleById(id)?.transformResult).toBeNull()

    const after = await server.transformRequest('/prompts/greet.md')
    expect(after?.code).toContain('Cheers, {{who}}.')
  })

  test('adding a file to a collection directory recompiles the collection', async () => {
    const id = join(dir, 'process/process.md')
    await server.transformRequest('/process/process.md')
    expect(server.moduleGraph.getModuleById(id)?.transformResult).not.toBeNull()

    const added = join(dir, 'process/03-done/done.node.md')
    mkdirSync(join(dir, 'process/03-done'))
    writeFileSync(added, '---\nid: n-done\nkind: node\n---\n\n# done\n')
    server.watcher.emit('add', added)
    expect(server.moduleGraph.getModuleById(id)?.transformResult).toBeNull()

    const after = await server.transformRequest('/process/process.md')
    expect(after?.code).toContain('"03-done/done.node.md"')
  })
})
