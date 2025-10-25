import { z } from 'zod'
import type { MarkdownDIConfig } from './packages/cli/src/index'

const documentSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string(),
  author: z.string(),
  status: z.string(),
  partials: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
})

export default {
  baseDir: '.',
  include: ['test-example.md'],
  exclude: ['node_modules/**'],
  schemas: {
    'test-document': documentSchema,
  },
  onBeforeCompile: async (context) => {
    console.log('Hook called with ID:', context.id)
    console.log('File path:', context.filePath)

    // Return variables to inject based on file ID
    return {
      author: 'Jane Doe',
      status: 'published',
    }
  },
} satisfies MarkdownDIConfig
