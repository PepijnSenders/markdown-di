import { z } from 'zod'
import type { MarkdownDIConfig } from '../src/index'

const documentSchema = z.object({
  name: z.string(),
  description: z.string(),
  partials: z.record(z.union([z.string(), z.array(z.string())])).optional(),
})

export default {
  baseDir: '.',
  include: ['*.md'],
  exclude: ['node_modules/**'],
  schemas: {
    'test-document': documentSchema,
  },
} satisfies MarkdownDIConfig
