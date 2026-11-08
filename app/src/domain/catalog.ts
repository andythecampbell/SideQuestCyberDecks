// Catalog schema. Pure domain code: no React, Three.js, or browser APIs.
import { z } from 'zod'
import { Id, Source } from './catalogPrimitives'
import { Articulated } from './articulatedSchema'

export const Vec3 = z.tuple([z.number(), z.number(), z.number()])
export type Vec3 = z.infer<typeof Vec3>

export const Confidence = z.enum(['datasheet', 'measured', 'estimate'])
export type Confidence = z.infer<typeof Confidence>

export const Facing = z.enum(['+x', '-x', '+y', '-y', '+z', '-z'])

const Vec2 = z.tuple([z.number(), z.number()])

/** Rectangle on the component's +Z face (e.g. a display's visible area), in local XY. */
const FaceRect = z
  .object({ min: Vec2, max: Vec2, confidence: Confidence })
  .refine((r) => r.min.every((v, i) => v < r.max[i]), 'min must be less than max on every axis')

const MountingHole = z.object({
  id: z.string(),
  position: Vec3,
  diameter: z.number().positive(),
  fastener: z.string().optional(),
  confidence: Confidence,
})

const Port = z.object({
  id: z.string(),
  type: z.string(),
  position: Vec3,
  facing: Facing,
  confidence: Confidence,
})

const KeepOut = z
  .object({
    id: z.string(),
    reason: z.string(),
    min: Vec3,
    max: Vec3,
    confidence: Confidence,
  })
  .refine((b) => b.min.every((v, i) => v < b.max[i]), 'min must be less than max on every axis')

const Envelope = z.object({
  size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  confidence: Confidence,
})

export const ComponentDefinition = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('component'),
  id: Id,
  revision: z.number().int().positive(),
  name: z.string(),
  category: z.enum(['compute', 'display', 'input', 'power', 'storage', 'comms', 'accessory']),
  notes: z.string().optional(),
  envelope: Envelope,
  activeArea: FaceRect.optional(),
  mountingHoles: z.array(MountingHole),
  ports: z.array(Port),
  keepOuts: z.array(KeepOut),
  power: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  sources: z.array(Source).min(1),
})
export type ComponentDefinition = z.infer<typeof ComponentDefinition>

const BoxEnclosureDefinition = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('enclosure'),
  id: Id,
  revision: z.number().int().positive(),
  name: z.string(),
  notes: z.string().optional(),
  interior: Envelope,
  wallThickness: z.number().positive(),
  sources: z.array(Source).min(1),
})
export const EnclosureDefinition = z.union([BoxEnclosureDefinition, Articulated])
export type EnclosureDefinition = z.infer<typeof EnclosureDefinition>

export const CatalogEntry = z.union([ComponentDefinition, EnclosureDefinition])
export type CatalogEntry = z.infer<typeof CatalogEntry>

/** Every confidence value recorded on a component, for flagging placeholder data. */
export function confidences(c: ComponentDefinition): Confidence[] {
  return [
    c.envelope.confidence,
    ...(c.activeArea ? [c.activeArea.confidence] : []),
    ...c.mountingHoles.map((h) => h.confidence),
    ...c.ports.map((p) => p.confidence),
    ...c.keepOuts.map((k) => k.confidence),
  ]
}

/** Labels of the component's catalog features whose confidence is `estimate`, in catalog order. */
export function estimateFeatures(c: ComponentDefinition): string[] {
  return [
    ...(c.envelope.confidence === 'estimate' ? ['envelope'] : []),
    ...(c.activeArea?.confidence === 'estimate' ? ['active area'] : []),
    ...c.mountingHoles.filter((h) => h.confidence === 'estimate').map((h) => `mounting hole ${h.id}`),
    ...c.ports.filter((p) => p.confidence === 'estimate').map((p) => `port ${p.id}`),
    ...c.keepOuts.filter((k) => k.confidence === 'estimate').map((k) => `keep-out ${k.id}`),
  ]
}

export const refKey = (ref: { id: string; revision: number }) => `${ref.id}@${ref.revision}`
