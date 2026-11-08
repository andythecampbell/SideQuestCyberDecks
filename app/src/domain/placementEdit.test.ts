import { describe, expect, test } from 'vitest'
import { editPlacement } from './placementEdit'
import { articulatedDeck } from '../articulatedFixture'

const LATER = '2026-11-08T12:00:00.000Z'
const clock = () => LATER

describe('editPlacement', () => {
  test('changes only the selected placement body-local position and stamps modifiedAt from the injected clock', () => {
    const before = structuredClone(articulatedDeck)
    const result = editPlacement(articulatedDeck, 'display', { position: [1, 2, 3] }, clock)
    expect(result.errors).toEqual([])
    expect(result.changed).toBe(true)
    const display = result.configuration.placements.find(p => p.id === 'display')!
    expect(display.position).toEqual([1, 2, 3])
    expect(result.configuration.modifiedAt).toBe(LATER)
    expect(result.configuration).toEqual({
      ...before,
      modifiedAt: LATER,
      placements: before.placements.map(p => p.id === 'display' ? { ...p, position: [1, 2, 3] } : p),
    })
    expect(articulatedDeck).toEqual(before)
  })
})

describe('rejected edits', () => {
  const invalid: [string, string, unknown][] = [
    ['non-finite position', 'display', { position: [Infinity, 0, 0] }],
    ['NaN position', 'pi', { position: [0, NaN, 0] }],
    ['non-finite rotation', 'display', { rotation: [NaN, 0, 0, 1] }],
    ['zero quaternion', 'display', { rotation: [0, 0, 0, 0] }],
    ['non-unit quaternion', 'pi', { rotation: [0, 0, 0, 2] }],
    ['unknown placement id', 'missing', { position: [0, 0, 0] }],
    ['null patch', 'display', null],
    ['string patch', 'display', 'position'],
    ['empty patch', 'display', {}],
    ['short position', 'display', { position: [1, 2] }],
    ['string coordinates', 'display', { position: ['1', '2', '3'] }],
    ['attachment edit', 'display', { attachment: 'base' }],
    ['component edit', 'display', { position: [0, 0, 0], component: { id: 'raspberry-pi-5', revision: 1 } }],
    ['id edit', 'display', { id: 'other' }],
    ['base edit', 'display', { base: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } }],
    ['enclosure edit', 'display', { enclosure: { id: 'placeholder-box', revision: 1 } }],
  ]
  test.each(invalid)('%s leaves the configuration unchanged and returns errors', (_, id, patch) => {
    const before = structuredClone(articulatedDeck)
    let calls = 0
    const result = editPlacement(articulatedDeck, id, patch, () => { calls++; return LATER })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.changed).toBe(false)
    expect(result.configuration).toBe(articulatedDeck)
    expect(articulatedDeck).toEqual(before)
    expect(calls).toBe(0)
  })
})

describe('no-op and re-validation', () => {
  const display = articulatedDeck.placements.find(p => p.id === 'display')!
  test.each([
    ['same position', { position: [...display.position] }],
    ['same rotation', { rotation: [...display.rotation] }],
    ['same position and rotation', { position: [...display.position], rotation: [...display.rotation] }],
  ])('%s is a no-op that does not touch modifiedAt or call the clock', (_, patch) => {
    let calls = 0
    const result = editPlacement(articulatedDeck, 'display', patch, () => { calls++; return LATER })
    expect(result).toEqual({ configuration: articulatedDeck, changed: false, errors: [] })
    expect(result.configuration).toBe(articulatedDeck)
    expect(result.configuration.modifiedAt).toBe(articulatedDeck.modifiedAt)
    expect(calls).toBe(0)
  })

  test('rotation-only edit stores the exact submitted unit quaternion', () => {
    const q: [number, number, number, number] = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
    const result = editPlacement(articulatedDeck, 'pi', { rotation: q }, clock)
    expect(result.changed).toBe(true)
    const pi = result.configuration.placements.find(p => p.id === 'pi')!
    expect(pi.rotation).toEqual(q)
    expect(pi.position).toEqual(articulatedDeck.placements.find(p => p.id === 'pi')!.position)
  })

  test('the whole result is re-validated: a malformed clock value is rejected', () => {
    const result = editPlacement(articulatedDeck, 'display', { position: [1, 2, 3] }, () => 'not a time')
    expect(result.changed).toBe(false)
    expect(result.configuration).toBe(articulatedDeck)
    expect(result.errors.join('\n')).toMatch(/modifiedAt/)
  })

  test('an invalid input configuration is rejected rather than edited', () => {
    const broken = { ...articulatedDeck, base: { ...articulatedDeck.base, position: [Infinity, 0, 0] } } as typeof articulatedDeck
    const result = editPlacement(broken, 'display', { position: [1, 2, 3] }, clock)
    expect(result.changed).toBe(false)
    expect(result.configuration).toBe(broken)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

import { rotateAboutBodyAxis } from './placementEdit'
import { rotate } from './articulation'
describe('rotateAboutBodyAxis (UI rotation entry)', () => {
  const closeTo = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 12))
  test('rotates about the attachment body axes and always returns a unit quaternion', () => {
    closeTo(rotateAboutBodyAxis([0, 0, 0, 1], 'x', 90), [Math.SQRT1_2, 0, 0, Math.SQRT1_2])
    const zThenX = rotateAboutBodyAxis(rotateAboutBodyAxis([0, 0, 0, 1], 'z', 90), 'x', 90)
    closeTo(rotate(zThenX, [1, 0, 0]), [0, 0, 1])
    let q: [number, number, number, number] = [0.5, 0.5, 0.5, 0.5]
    for (let i = 0; i < 1000; i++) q = rotateAboutBodyAxis(q, (['x', 'y', 'z'] as const)[i % 3], 7.3)
    expect(Math.hypot(...q)).toBeCloseTo(1, 15)
  })
  test('rejects non-finite angles by returning the stored quaternion unchanged', () => {
    const q: [number, number, number, number] = [0, 0, 0, 1]
    expect(rotateAboutBodyAxis(q, 'y', NaN)).toBe(q)
    expect(rotateAboutBodyAxis(q, 'y', Infinity)).toBe(q)
  })
})
