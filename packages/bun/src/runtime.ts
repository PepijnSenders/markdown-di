// What bundled template modules import at runtime: only the snapshot renderer.
// The package entry also exports the disk sources and typegen, whose
// dependencies (fast-glob and its tree) a compiled binary would then load at
// every start for nothing.
export { createRendererFromSnapshot } from '@markdown-di/core/modules'
