// Configuration record. Plain serializable data; the 3D scene is a projection of this.
import { z } from 'zod'
import { Vec3 } from './catalog'

const CatalogRef = z.object({ id: z.string(), revision: z.number().int().positive() })

/** Unit quaternion [x, y, z, w]. */
export const Quaternion = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine((q) => Math.abs(Math.hypot(...q) - 1) < 1e-6, 'rotation must be a unit quaternion')

export const Placement = z.object({
  id: z.string(),
  component: CatalogRef,
  /** Position of the component origin in enclosure coordinates, mm. */
  position: Vec3,
  rotation: Quaternion,
})
export type Placement = z.infer<typeof Placement>

export const Configuration = z.object({
  schemaVersion: z.literal(1),
  units: z.literal('mm'),
  coordinateSystem: z.literal('right-handed-z-up'),
  enclosure: CatalogRef,
  placements: z.array(Placement),
  createdAt: z.iso.datetime(),
  modifiedAt: z.iso.datetime(),
})
export type Configuration = z.infer<typeof Configuration>

export const IDENTITY: [number, number, number, number] = [0, 0, 0, 1]
