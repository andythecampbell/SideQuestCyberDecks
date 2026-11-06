import { z } from 'zod'
import { Configuration, type Configuration as V1 } from './configuration'
import { refKey, type ComponentDefinition } from './catalog'
import { Transform, identity, compose, axisRotation } from './articulation'
import { Articulated } from './articulatedSchema'
export { Articulated } from './articulatedSchema'

const Ref = z.object({ id: z.string(), revision: z.number().int().positive() }).strict()
export const ConfigurationV2 = z.object({
  schemaVersion: z.literal(2),
  units: z.literal('mm'),
  coordinateSystem: z.literal('right-handed-z-up'),
  enclosure: Ref,
  base: Transform,
  placements: z.array(Transform.extend({
    id: z.string(), component: Ref, attachment: z.enum(['base', 'lid']),
  }).strict()).refine(p => new Set(p.map(x => x.id)).size === p.length, 'unique placement IDs required'),
  createdAt: z.iso.datetime(),
  modifiedAt: z.iso.datetime(),
}).strict()
export type ConfigurationV2 = z.infer<typeof ConfigurationV2>

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
  components: Map<string, ComponentDefinition>,
  pose: 'OPEN' | 'CLOSED',
) {
  const c = ConfigurationV2.parse(input)
  if (enclosure.schemaVersion !== 1 && enclosure.schemaVersion !== 2) throw Error('Unsupported enclosure schema')
  if (pose !== 'OPEN' && pose !== 'CLOSED') throw Error('Unsupported pose')
  if (refKey(c.enclosure) !== refKey(enclosure)) throw Error('Missing enclosure reference')

  let lid = identity()
  if (enclosure.schemaVersion === 2) {
    const h = Articulated.parse(enclosure).hinge
    const pivot = { ...identity(), position: h.pivot }
    const unpivot = { ...identity(), position: h.pivot.map(x => -x) as [number, number, number] }
    const turn = { ...identity(), rotation: axisRotation(h.axis, h.sign * (h.sourceDrivers[pose] - h.referenceDriver)) }
    lid = compose(compose(compose(pivot, turn), unpivot), h.reference)
  } else if (c.placements.some(p => p.attachment === 'lid')) {
    throw Error('Legacy enclosure has no lid')
  }

  const bodies = { base: c.base, lid: compose(c.base, lid) }
  const placements = c.placements.map(p => {
    if (!components.has(refKey(p.component))) throw Error(`Missing component ${refKey(p.component)}`)
    return { ...p, ...compose(bodies[p.attachment], p) }
  })
  return { bodies, placements }
}
