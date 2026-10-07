import { resolve } from 'node:path'
import {
  collectSources as collectFrom,
  createRenderer as createFrom,
  type Renderer,
  type Sources,
  type TemplateSnapshot,
} from '@markdown-di/core/modules'
import { diskSources } from '@markdown-di/core/modules/node'

export {
  createRendererFromSnapshot,
  type Renderer,
  type RenderFunction,
  type TemplateSnapshot,
} from '@markdown-di/core/modules'

/**
 * Compile a markdown-di file into a strict, synchronous render function.
 *
 * The engine lives in `@markdown-di/core/modules` (shared with the Vite
 * plugin); this binds it to the disk and resolves relative paths against the
 * cwd. Rendering mirrors @markdown-di/core's ContentProcessor (partials, nested
 * partials, `$parent` scoping, glob patterns) — pinned by test/parity.test.ts —
 * but is strict: any violation throws a RenderError instead of producing an
 * empty string.
 */
export function createRenderer(filePath: string, sources: Sources = diskSources): Renderer {
  return createFrom(resolve(filePath), sources)
}

/**
 * Walk a template's partial graph and capture every source it touches into a
 * TemplateSnapshot. Runs at build time against the disk (by default); the
 * result is inlined by the bundle loader so the compiled binary can render with
 * no fs.
 */
export function collectSources(filePath: string, sources: Sources = diskSources): TemplateSnapshot {
  return collectFrom(resolve(filePath), sources)
}
