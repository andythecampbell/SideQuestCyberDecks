import { describe, expect, test } from 'vitest'
import { editPlacement } from './placementEdit'
import { resolve, Articulated, type ConfigurationV2 } from './articulated'
import { articulatedDeck } from '../articulatedFixture'
import { catalog } from '../catalog'

// Independent 4x4 homogeneous-matrix implementation of the ADR 0001 formula. It deliberately
// shares no code with articulation.ts (no quaternion multiply / compose).
type M = number[][]
type V3 = [number, number, number]
type Q4 = [number, number, number, number]
const mul = (a: M, b: M): M => a.map((_, i) => [0, 1, 2, 3].map(j => [0, 1, 2, 3].reduce((s, k) => s + a[i][k] * b[k][j], 0)))
const translate = ([x, y, z]: V3): M => [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]]
const fromQuaternion = ([x, y, z, w]: Q4): M => [
  [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
  [0, 0, 0, 1],
]
/** Rodrigues' rotation formula, degrees. */
const rotateAxis = ([x, y, z]: V3, degrees: number): M => {
  const t = degrees * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), C = 1 - c
  return [
    [c + x * x * C, x * y * C - z * s, x * z * C + y * s, 0],
    [y * x * C + z * s, c + y * y * C, y * z * C - x * s, 0],
    [z * x * C - y * s, z * y * C + x * s, c + z * z * C, 0],
    [0, 0, 0, 1],
  ]
}
const rigid = (t: { position: V3; rotation: Q4 }) => mul(translate(t.position), fromQuaternion(t.rotation))
const neg = ([x, y, z]: V3): V3 => [-x, -y, -z]

const enclosure = Articulated.parse(catalog.enclosures.get('case-2800-preview@1'))
const POSES = ['OPEN', 'CLOSED'] as const

/** worldBase * T(pivot) * R(axis, sign*(driver-ref)) * T(-pivot) * referenceLid * local; base uses identity. */
function expectedWorld(c: ConfigurationV2, id: string, pose: 'OPEN' | 'CLOSED'): M {
  const p = c.placements.find(x => x.id === id)!
  const h = enclosure.hinge
  const body = p.attachment === 'base'
    ? translate([0, 0, 0])
    : mul(mul(mul(translate(h.pivot), rotateAxis(h.axis, h.sign * (h.sourceDrivers[pose] - h.referenceDriver))), translate(neg(h.pivot))), rigid(h.reference))
  return mul(mul(rigid(c.base), body), rigid(p))
}
function expectMatrixClose(actual: M, expected: M) {
  actual.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(expected[i][j], 9)))
}

const clock = () => '2026-11-08T12:00:00.000Z'
const edited = () => {
  const lid = editPlacement(articulatedDeck, 'display', { position: [-70, 50, 12.5], rotation: [0.5, 0.5, 0.5, 0.5] }, clock)
  const both = editPlacement(lid.configuration, 'pi', { position: [-120, 30, -75], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, clock)
  expect(lid.errors).toEqual([]); expect(both.errors).toEqual([])
  return { lidOnly: lid.configuration, both: both.configuration }
}

describe('ADR 0001 resolved transforms after editing', () => {
  test('editing a lid-attached placement changes only its local transform', () => {
    const { lidOnly } = edited()
    const strip = (c: ConfigurationV2) => ({ ...c, modifiedAt: undefined, placements: c.placements.map(p => p.id === 'display' ? { ...p, position: undefined, rotation: undefined } : p) })
    expect(strip(lidOnly)).toEqual(strip(articulatedDeck))
    const display = lidOnly.placements.find(p => p.id === 'display')!
    expect(display.attachment).toBe('lid')
    expect(display.position).toEqual([-70, 50, 12.5])
    expect(display.rotation).toEqual([0.5, 0.5, 0.5, 0.5])
  })

  test.each(POSES)('edited lid placement world transform in %s matches the independent ADR formula', pose => {
    const { both } = edited()
    for (const p of both.placements) {
      const world = resolve(both, enclosure, catalog.components, pose).placements.find(x => x.id === p.id)!
      expectMatrixClose(rigid(world), expectedWorld(both, p.id, pose))
    }
  })

  test('also holds under a non-identity world base', () => {
    const { both } = edited()
    const c = { ...both, base: { position: [10, -20, 30] as V3, rotation: [0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)] as Q4 } }
    for (const pose of POSES) for (const p of c.placements) {
      const world = resolve(c, enclosure, catalog.components, pose).placements.find(x => x.id === p.id)!
      expectMatrixClose(rigid(world), expectedWorld(c, p.id, pose))
    }
  })
})

describe('pose independence after editing', () => {
  test('base-attached world transforms are identical across poses', () => {
    const { both } = edited()
    const open = resolve(both, enclosure, catalog.components, 'OPEN')
    const closed = resolve(both, enclosure, catalog.components, 'CLOSED')
    const base = both.placements.filter(p => p.attachment === 'base')
    expect(base.map(p => p.id)).toContain('pi')
    for (const p of base) expect(open.placements.find(x => x.id === p.id)).toEqual(closed.placements.find(x => x.id === p.id))
  })

  test('lid-attached local values are identical across poses, and the lid world transform moves', () => {
    const { both } = edited()
    const local = both.placements.find(p => p.id === 'display')!
    const stored = structuredClone(local)
    const open = resolve(both, enclosure, catalog.components, 'OPEN').placements.find(p => p.id === 'display')!
    const closed = resolve(both, enclosure, catalog.components, 'CLOSED').placements.find(p => p.id === 'display')!
    expect(both.placements.find(p => p.id === 'display')).toEqual(stored)
    expect(open.position).not.toEqual(closed.position)
  })

  test('toggling the pose any number of times leaves the configuration deep-equal and modifiedAt unchanged', () => {
    const { both } = edited()
    const snapshot = structuredClone(both)
    for (let i = 0; i < 101; i++) resolve(both, enclosure, catalog.components, i % 2 ? 'OPEN' : 'CLOSED')
    expect(both).toEqual(snapshot)
    expect(both.modifiedAt).toBe(snapshot.modifiedAt)
  })
})
