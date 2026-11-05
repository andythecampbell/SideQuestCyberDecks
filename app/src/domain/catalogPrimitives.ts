import { z } from 'zod'

export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lowercase kebab-case')

export const Source = z.object({
  kind: z.string(),
  title: z.string(),
  url: z.url().optional(),
  license: z.string().optional(),
}).strict()
