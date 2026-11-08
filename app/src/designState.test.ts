import { expect, test } from 'vitest'
import { applyPlacementEdit, initialDesign } from './designState'
import { articulatedDeck } from './articulatedFixture'
import { ConfigurationV2 } from './domain/articulated'

const clock = () => '2026-11-08T12:00:00.000Z'

test('design state holds only the configuration, the unsaved flag and last edit errors; never pose or selection', () => {
  const state = initialDesign(articulatedDeck)
  expect(Object.keys(state).sort()).toEqual(['configuration', 'errors', 'unsaved'])
  expect(state).toEqual({ configuration: articulatedDeck, unsaved: false, errors: [] })
})

test('an accepted edit replaces the configuration and marks it unsaved', () => {
  const next = applyPlacementEdit(initialDesign(articulatedDeck), 'display', { position: [1, 2, 3] }, clock)
  expect(next.unsaved).toBe(true)
  expect(next.errors).toEqual([])
  expect(next.configuration.placements.find(p => p.id === 'display')!.position).toEqual([1, 2, 3])
  expect(ConfigurationV2.safeParse(next.configuration).success).toBe(true)
  expect(Object.keys(next.configuration)).not.toEqual(expect.arrayContaining(['pose']))
})

test('a rejected edit keeps the configuration and unsaved flag and reports errors', () => {
  const start = initialDesign(articulatedDeck)
  const next = applyPlacementEdit(start, 'display', { rotation: [0, 0, 0, 0] }, clock)
  expect(next.configuration).toBe(articulatedDeck)
  expect(next.unsaved).toBe(false)
  expect(next.errors.length).toBeGreaterThan(0)
})

test('a no-op edit keeps the state, clears stale errors and does not mark unsaved', () => {
  const start = initialDesign(articulatedDeck)
  const display = articulatedDeck.placements.find(p => p.id === 'display')!
  expect(applyPlacementEdit(start, 'display', { position: display.position }, clock)).toBe(start)
  const failed = applyPlacementEdit(start, 'display', { position: [NaN, 0, 0] }, clock)
  const cleared = applyPlacementEdit(failed, 'display', { position: display.position }, clock)
  expect(cleared).toEqual(start)
  expect(cleared.configuration).toBe(articulatedDeck)
})
