/**
 * `@markdown-di/content-mapper` — a TypeScript 7.1+ content mapper for
 * markdown-di files. TypeScript runs `dist/server.js` itself (see the
 * `typescript.contentMapper` field of package.json); this entry exposes the
 * transform for tests and other hosts.
 */
export type {
  MapperDiagnostic,
  PositionEncoding,
  SpanMapping,
  TransformResult,
} from './protocol'
export { type TransformOptions, transformMarkdown } from './transform'
