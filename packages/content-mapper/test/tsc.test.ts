import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tsc = join(
  createRequire(import.meta.url).resolve('typescript7/package.json'),
  '..',
  'bin',
  'tsc',
)
const server = join(import.meta.dir, '../src/server.ts')

/**
 * A project the real TypeScript 7.1 compiler checks, with this package's
 * server registered as the `.md` content mapper (run from source by Bun, so
 * no build is needed).
 */
function checkProject(files: Record<string, string>): { exitCode: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'markdown-di-content-mapper-'))
  try {
    const write = (path: string, contents: string) => {
      mkdirSync(join(dir, path, '..'), { recursive: true })
      writeFileSync(join(dir, path), contents)
    }
    write(
      'node_modules/md-mapper/package.json',
      JSON.stringify({
        name: 'md-mapper',
        version: '0.0.0',
        typescript: { contentMapper: { exec: ['bun', server] } },
      }),
    )
    write(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          target: 'es2022',
        },
        include: ['src'],
        contentMappers: [{ package: 'md-mapper', extensions: ['.md'] }],
      }),
    )
    for (const [path, contents] of Object.entries(files)) write(path, contents)

    const result = Bun.spawnSync([tsc, '-p', dir, '--runExternalCode', '--pretty', 'false'], {
      cwd: dir,
    })
    const output = `${result.stdout.toString()}${result.stderr.toString()}`
    return { exitCode: result.exitCode, output: output.replaceAll(dir, '<project>') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const BRIEF =
  '---\nparams:\n  transcript: string\n  attempt?: number\n---\nSummarize {{transcript}}.\n'

describe('tsc 7.1 with the content mapper', () => {
  test('a correct call type-checks', () => {
    const { exitCode, output } = checkProject({
      'src/brief.md': BRIEF,
      'src/index.ts':
        "import brief from './brief.md'\nexport const text: string = brief({ transcript: 'hi', attempt: 2 })\n",
    })
    expect(output).toBe('')
    expect(exitCode).toBe(0)
  })

  test('a wrong call fails against the params in the frontmatter', () => {
    const { exitCode, output } = checkProject({
      'src/brief.md': BRIEF,
      'src/index.ts': "import brief from './brief.md'\nbrief({ transcript: 1 })\nbrief({})\n",
    })
    expect(exitCode).toBe(2)
    expect(output).toContain(
      "index.ts(2,9): error TS2322: Type 'number' is not assignable to type 'string'.",
    )
    expect(output).toContain(
      "index.ts(3,7): error TS2741: Property 'transcript' is missing in type '{}' but required in type 'BriefParams'.",
    )
  })

  test('a frontmatter error is reported in the markdown file', () => {
    const { exitCode, output } = checkProject({
      'src/typo.md': '---\nparams:\n  a: strin\n---\nx\n',
      'src/index.ts': "import typo from './typo.md'\ntypo()\n",
    })
    expect(exitCode).toBe(2)
    expect(output).toContain(
      'typo.md(2,1): error markdown-di1002: param "a" has unsupported type "strin"',
    )
  })
})
