import { afterAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'

const server = Bun.spawn(['bun', join(import.meta.dir, '../src/server.ts')], {
  stdin: 'pipe',
  stdout: 'pipe',
  stderr: 'inherit',
})

afterAll(() => server.kill())

const reader = server.stdout.getReader()
let pending = Buffer.alloc(0)
let nextId = 1

async function readMessage(): Promise<Record<string, unknown>> {
  for (;;) {
    const headerEnd = pending.indexOf('\r\n\r\n')
    if (headerEnd !== -1) {
      const length = Number(
        /Content-Length: (\d+)/.exec(pending.toString('ascii', 0, headerEnd))?.[1],
      )
      const end = headerEnd + 4 + length
      if (pending.length >= end) {
        const message = JSON.parse(pending.toString('utf8', headerEnd + 4, end))
        pending = pending.subarray(end)
        return message
      }
    }
    const { value, done } = await reader.read()
    if (done) throw new Error('the mapper exited')
    pending = Buffer.concat([pending, value])
  }
}

function send(payload: string): void {
  const body = Buffer.from(payload, 'utf8')
  server.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
  server.stdin.write(body)
  server.stdin.flush()
}

async function call(method: string, params?: unknown) {
  const id = nextId++
  send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
  const response = await readMessage()
  expect(response.id).toBe(id)
  return response
}

describe('content mapper server', () => {
  test('a transform before initialize fails', async () => {
    const response = await call('transform', {
      fileName: '/virtual/x.md',
      content: 'x',
      projectHandle: 'p1',
    })
    expect(response.error).toMatchObject({ code: -32603, message: 'transform before initialize' })
  })

  test('initialize picks utf-16 when offered', async () => {
    const response = await call('initialize', { positionEncodings: ['utf-8', 'utf-16'] })
    expect(response.result).toEqual({ positionEncoding: 'utf-16', diagnosticSource: 'markdown-di' })
  })

  test('a transform for a project that is not open fails', async () => {
    const response = await call('transform', {
      fileName: '/virtual/x.md',
      content: 'x',
      projectHandle: 'p1',
    })
    expect(response.error).toMatchObject({ code: -32603 })
  })

  test('openProject, transform and closeProject', async () => {
    const opened = await call('openProject', {
      configFileName: '/virtual/tsconfig.json',
      projectHandle: 'p1',
      compilerOptions: {},
    })
    expect(opened.result).toEqual({})

    const transformed = await call('transform', {
      fileName: '/virtual/brief.md',
      content: '---\nparams:\n  topic: string\n---\n{{topic}}\n',
      projectHandle: 'p1',
    })
    expect(transformed.result).toMatchObject({ extension: '.ts', mappings: [expect.any(Array)] })
    expect((transformed.result as { text: string }).text).toContain(
      'declare function render(params: BriefParams): string',
    )

    expect((await call('closeProject', { projectHandle: 'p1' })).result).toBeNull()
  })

  test('an unknown method is method-not-found', async () => {
    const response = await call('hover', {})
    expect(response.error).toMatchObject({ code: -32601 })
  })

  test('a payload that is not JSON is a parse error', async () => {
    send('{nope')
    expect(await readMessage()).toMatchObject({ id: null, error: { code: -32700 } })
  })
})
