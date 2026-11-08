// Pure body-local placement edit. No React, Three.js, or browser APIs.
import { z } from 'zod'
import { ConfigurationV2 } from './articulated'
import { Transform, axisRotation, compose } from './articulation'

/**
 * Only body-local position (mm) and rotation (unit quaternion [x, y, z, w]) are editable.
 * Strict: id, component, attachment, base and enclosure keys are rejected, never applied.
 */
export const PlacementPatch = z.object({
  position: Transform.shape.position.optional(),
  rotation: Transform.shape.rotation.optional(),
}).strict().refine(p => p.position !== undefined || p.rotation !== undefined, 'patch must set position and/or rotation')
export type PlacementPatch = z.infer<typeof PlacementPatch>

export interface EditResult {
  configuration: ConfigurationV2
  changed: boolean
  errors: string[]
}

const issues = (error: z.ZodError) =>
  error.issues.map(i => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message)

/**
 * Edits one placement's body-local position and/or rotation, then re-validates the whole result.
 * A rejected edit returns errors and the original configuration object. The clock is injected.
 */
export function editPlacement(
  configuration: ConfigurationV2,
  placementId: string,
  patch: unknown,
  clock: () => string,
): EditResult {
  const reject = (errors: string[]): EditResult => ({ configuration, changed: false, errors })

  const input = ConfigurationV2.safeParse(configuration)
  if (!input.success) return reject(issues(input.error).map(e => `configuration: ${e}`))
  const parsed = PlacementPatch.safeParse(patch)
  if (!parsed.success) return reject(issues(parsed.error))
  const current = configuration.placements.find(p => p.id === placementId)
  if (!current) return reject([`unknown placement id: ${placementId}`])

  const position = parsed.data.position ?? current.position
  const rotation = parsed.data.rotation ?? current.rotation
  if (sameValues(position, current.position) && sameValues(rotation, current.rotation)) {
    return { configuration, changed: false, errors: [] }
  }

  const result = ConfigurationV2.safeParse({
    ...configuration,
    modifiedAt: clock(),
    placements: configuration.placements.map(p => p.id === placementId ? { ...p, position, rotation } : p),
  })
  if (!result.success) return reject(issues(result.error))
  return { configuration: result.data, changed: true, errors: [] }
}

type Quaternion = Transform['rotation']
const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } as const

/**
 * Rotation entry helper: rotates a stored orientation about the attachment body's X/Y/Z axis
 * (pre-multiplication) and renormalizes. Non-finite angles return the input unchanged.
 */
export function rotateAboutBodyAxis(q: Quaternion, axis: keyof typeof AXES, degrees: number): Quaternion {
  if (!Number.isFinite(degrees)) return q
  const turn = { position: [0, 0, 0] as [number, number, number], rotation: axisRotation([...AXES[axis]], degrees) }
  const r = compose(turn, { position: [0, 0, 0], rotation: q }).rotation
  const n = Math.hypot(...r)
  return r.map(v => v / n) as Quaternion
}

const sameValues = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])
