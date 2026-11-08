import { z } from 'zod'
import { Configuration, type Configuration as V1 } from './configuration'
import { refKey, type ComponentDefinition } from './catalog'
import { Transform, identity, compose, axisRotation } from './articulation'
import { Articulated } from './articulatedSchema'
export { Articulated } from './articulatedSchema'

const Ref = z.object({ id: z.string(), revision: z.number().int().positive() }).strict()

/** Ids that occur more than once, in first-duplicate order. */
function duplicateIds(placements: { id: string }[]): string[] {
  const seen = new Set<string>(), duplicates = new Set<string>()
  for (const { id } of placements) (seen.has(id) ? duplicates : seen).add(id)
  return [...duplicates]
}

export const ConfigurationV2 = z.object({
  schemaVersion: z.literal(2),
  units: z.literal('mm'),
  coordinateSystem: z.literal('right-handed-z-up'),
  enclosure: Ref,
  base: Transform,
  placements: z.array(Transform.extend({
    id: z.string(), component: Ref, attachment: z.enum(['base', 'lid']),
  }).strict()).refine(p => duplicateIds(p).length === 0, {
    error: issue => `duplicate placement id: ${duplicateIds(issue.input as { id: string }[]).map(id => JSON.stringify(id)).join(', ')}`,
  }),
  createdAt: z.iso.datetime(),
  modifiedAt: z.iso.datetime(),
}).strict()
export type ConfigurationV2 = z.infer<typeof ConfigurationV2>

/** Every pose a configuration must resolve in. Pose is inspection state, never stored in a design. */
export const POSES = ['OPEN', 'CLOSED'] as const
export type Pose = (typeof POSES)[number]

export function migrateV1ToV2(input: V1): ConfigurationV2 {
  const c = Configuration.parse(input)
  return ConfigurationV2.parse({
    ...c, schemaVersion: 2, base: identity(),
    placements: c.placements.map(p => ({ ...p, attachment: 'base' })),
  })
}

/** Pose is inspection state. This function never mutates the stored design. */
export function resolve(
  input: ConfigurationV2,
  enclosure: { id: string; revision: number; schemaVersion: number },
  components: ReadonlyMap<string, ComponentDefinition>,
  pose: Pose,
) {
  const c = ConfigurationV2.parse(input)
  if (enclosure.schemaVersion !== 1 && enclosure.schemaVersion !== 2) throw Error('Unsupported enclosure schema')
  if (!POSES.includes(pose)) throw Error('Unsupported pose')
  if (refKey(c.enclosure) !== refKey(enclosure)) throw Error('Missing enclosure reference')

  let lid = identity()
  if (enclosure.schemaVersion === 2) {
    const h = Articulated.parse(enclosure).hinge
    const pivot = { ...identity(), position: h.pivot }
    const unpivot = { ...identity(), position: h.pivot.map(x => -x) as [number, number, number] }
    const turn = { ...identity(), rotation: axisRotation(h.axis, h.sign * (h.sourceDrivers[pose] - h.referenceDriver)) }
    lid = compose(compose(compose(pivot, turn), unpivot), h.reference)
  } else {
    const lidPlacement = c.placements.find(p => p.attachment === 'lid')
    if (lidPlacement) throw Error(`Box enclosure ${refKey(enclosure)} has no lid; placement ${JSON.stringify(lidPlacement.id)} is attached to lid`)
  }

  const bodies = { base: c.base, lid: compose(c.base, lid) }
  const placements = c.placements.map(p => {
    if (!components.has(refKey(p.component))) throw Error(`Missing component ${refKey(p.component)}`)
    return { ...p, ...compose(bodies[p.attachment], p) }
  })
  return { bodies, placements }
}
