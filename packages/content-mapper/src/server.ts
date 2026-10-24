#!/usr/bin/env node

import type {
  CloseProjectParams,
  InitializeParams,
  InitializeResult,
  OpenProjectParams,
  OpenProjectResult,
  PositionEncoding,
  TransformParams,
  TransformResult,
} from './protocol'
import { transformMarkdown } from './transform'

/**
 * The process TypeScript spawns for `.md` files: JSON-RPC 2.0 requests on
 * stdin, responses on stdout, each framed by a `Content-Length` header.
 * Nothing else may be written to stdout.
 */

type JsonRpcId = string | number | null

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603

let positionEncoding: PositionEncoding | undefined
const openProjects = new Set<string>()

function initialize(params: InitializeParams): InitializeResult {
  const offered = params?.positionEncodings ?? []
  // JavaScript strings are UTF-16, so prefer it and skip every conversion.
  if (offered.includes('utf-16')) positionEncoding = 'utf-16'
  else if (offered.includes('utf-8')) positionEncoding = 'utf-8'
  else throw new Error('the host offers neither utf-16 nor utf-8 positions')
  return { positionEncoding, diagnosticSource: 'markdown-di' }
}

function handle(request: JsonRpcRequest): unknown {
  switch (request.method) {
    case 'initialize':
      return initialize(request.params as InitializeParams)
    case 'openProject': {
      const params = request.params as OpenProjectParams
      if (typeof params?.projectHandle !== 'string') throw invalidParams('projectHandle')
      openProjects.add(params.projectHandle)
      return {} satisfies OpenProjectResult
    }
    case 'transform': {
      const params = request.params as TransformParams
      if (typeof params?.fileName !== 'string' || typeof params.content !== 'string') {
        throw invalidParams('fileName and content')
      }
      if (positionEncoding === undefined) throw new Error('transform before initialize')
      if (!openProjects.has(params.projectHandle)) {
        throw new Error(`transform for a project that is not open: ${params.projectHandle}`)
      }
      return transformMarkdown({
        fileName: params.fileName,
        content: params.content,
        positionEncoding,
      }) satisfies TransformResult
    }
    case 'closeProject': {
      openProjects.delete((request.params as CloseProjectParams)?.projectHandle)
      return null
    }
    default:
      throw Object.assign(new Error(`method not found: ${request.method}`), {
        code: METHOD_NOT_FOUND,
      })
  }
}

function invalidParams(names: string): Error {
  return Object.assign(new Error(`${names} must be strings`), { code: INVALID_PARAMS })
}

function dispatch(payload: Buffer): void {
  let request: unknown
  try {
    request = JSON.parse(payload.toString('utf8'))
  } catch {
    writeError(null, PARSE_ERROR, 'parse error')
    return
  }
  if (!isRequest(request)) {
    writeError(null, INVALID_REQUEST, 'invalid request')
    return
  }
  try {
    write({ jsonrpc: '2.0', id: request.id, result: handle(request) })
  } catch (error) {
    const code = (error as { code?: unknown }).code
    writeError(
      request.id,
      typeof code === 'number' ? code : INTERNAL_ERROR,
      error instanceof Error ? error.message : String(error),
    )
  }
}

function isRequest(value: unknown): value is JsonRpcRequest {
  const request = value as Partial<JsonRpcRequest> | null
  return (
    typeof request === 'object' &&
    request !== null &&
    request.jsonrpc === '2.0' &&
    (typeof request.id === 'string' || typeof request.id === 'number') &&
    typeof request.method === 'string'
  )
}

function writeError(id: JsonRpcId, code: number, message: string): void {
  write({ jsonrpc: '2.0', id, error: { code, message } })
}

function write(message: object): void {
  const payload = Buffer.from(JSON.stringify(message), 'utf8')
  process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`)
  process.stdout.write(payload)
}

let buffer = Buffer.alloc(0)

process.stdin.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return
    const length = /^Content-Length:\s*(\d+)\s*$/im.exec(
      buffer.subarray(0, headerEnd).toString('ascii'),
    )
    if (!length) {
      process.stderr.write('markdown-di content mapper: a message without Content-Length\n')
      process.exit(1)
    }
    const start = headerEnd + 4
    const end = start + Number(length[1])
    if (buffer.length < end) return
    const payload = buffer.subarray(start, end)
    buffer = buffer.subarray(end)
    dispatch(payload)
  }
})
