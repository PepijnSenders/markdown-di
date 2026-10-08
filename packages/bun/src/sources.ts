// Every filesystem touch the renderer makes goes through a `Sources`; the disk
// implementation lives in @markdown-di/core so the Bun loader, the Vite plugin
// and typegen glob and read files identically.
export type { Sources } from '@markdown-di/core/modules'
export { diskSources } from '@markdown-di/core/modules/node'
