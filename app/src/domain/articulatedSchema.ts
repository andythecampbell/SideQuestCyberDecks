import { z } from 'zod'
import { Id, Source } from './catalogPrimitives'
import { Transform, Vector } from './articulation'

/** Provisional variant only. Accepted calibration needs an explicit future decision. */
export const Articulated = z.object({
  schemaVersion: z.literal(2),
  kind: z.literal('enclosure'),
  id: Id,
  sources: z.array(Source).min(1),
  revision: z.number().int().positive(),
  name: z.string(),
  calibration: z.literal('UNRESOLVED'),
  assumptions: z.string().min(1),
  bodies: z.object({ base: z.literal('base'), lid: z.literal('lid') }).strict(),
  hinge: z.object({
    pivot: Vector,
    axis: Vector.refine(a => Math.abs(Math.hypot(...a) - 1) < 1e-6, 'axis must be unit'),
    reference: Transform,
    referenceDriver: z.number().finite(),
    sign: z.union([z.literal(1), z.literal(-1)]),
    sourceDrivers: z.object({ OPEN: z.literal(120), CLOSED: z.literal(210) }).strict(),
  }).strict(),
}).strict()
export type Articulated = z.infer<typeof Articulated>
