import { z } from 'zod'

export const Vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
const Quaternion = z.tuple([
  z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(),
]).refine(q => Math.abs(Math.hypot(...q) - 1) < 1e-6, 'rotation must be a unit quaternion')

export const Transform = z.object({ position: Vector, rotation: Quaternion }).strict()
export type Transform = z.infer<typeof Transform>
type V = z.infer<typeof Vector>
type Q = Transform['rotation']

export const identity = (): Transform => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] })

function multiply(a: Q, b: Q): Q {
  const [x, y, z, w] = a, [X, Y, Z, W] = b
  return [
    w*X + x*W + y*Z - z*Y,
    w*Y - x*Z + y*W + z*X,
    w*Z + x*Y - y*X + z*W,
    w*W - x*X - y*Y - z*Z,
  ]
}

export function rotate(q: Q, v: V): V {
  return multiply(multiply(q, [...v, 0]), [-q[0], -q[1], -q[2], q[3]]).slice(0, 3) as V
}

/** Column vectors: b acts first, then a. No mutable scene objects. */
export function compose(a: Transform, b: Transform): Transform {
  const offset = rotate(a.rotation, b.position)
  return {
    position: offset.map((v, i) => v + a.position[i]) as V,
    rotation: multiply(a.rotation, b.rotation),
  }
}

export function axisRotation(axis: V, degrees: number): Q {
  const half = degrees * Math.PI / 360
  return [...axis.map(v => v * Math.sin(half)), Math.cos(half)] as Q
}
