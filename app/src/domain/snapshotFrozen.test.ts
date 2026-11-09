import { describe, expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { POSES, resolve, type ConfigurationV2 } from './articulated'
import { parseSnapshot, serializeSnapshot } from './snapshot'
import { catalog } from '../catalog'

// Byte-frozen compatibility fixtures. Changes require an explicit compatibility decision. Andy's
// confirmed Hosyond spelling updated the exact catalog references in all active snapshots.
const dir = join(__dirname, '__fixtures__')
const read = (name: string) => readFileSync(join(dir, name), 'utf8')
const PINS = {
  'snapshot-v1.frozen.json': 'c712f8fdc37a4ae7fba9f312077dc182d1287943fbe115d4be2017126425f065',
  'snapshot-v1-extra-keys.frozen.json': '6e9a893b0bbc39fbfeb421f52fd5f18fe261aafaf84602ab97a5b56ec40b7152',
  'snapshot-v2.frozen.json': 'cfa1fe47a8f3980f26aab4ac358b538f679dabdd46d80cefa6285c19ff3e40f5',
}

const accepted = (text: string) => {
  const result = parseSnapshot(text, catalog)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result
}
const enclosureOf = (c: ConfigurationV2) => catalog.enclosures.get(`${c.enclosure.id}@${c.enclosure.revision}`)!

describe('frozen snapshot fixtures', () => {
  test.each(Object.entries(PINS))('%s is byte-identical to its pinned hash', (name, sha256) => {
    expect(createHash('sha256').update(read(name)).digest('hex')).toBe(sha256)
  })

  describe('frozen v2', () => {
    const text = read('snapshot-v2.frozen.json')

    test('imports strictly, with no notices and the file timestamps', () => {
      const { configuration, notices, sourceVersion } = accepted(text)
      expect(sourceVersion).toBe(2)
      expect(notices).toEqual([])
      expect(configuration.createdAt).toBe('2026-10-07T00:00:00.000Z')
      expect(configuration.modifiedAt).toBe('2026-10-07T00:00:00.000Z')
      expect(configuration.enclosure).toEqual({ id: 'case-2800-preview', revision: 1 })
    })

    test('is canonical: export and re-import are byte-identical', () => {
      const once = serializeSnapshot(accepted(text).configuration)
      expect(once).toBe(text)
      expect(serializeSnapshot(accepted(once).configuration)).toBe(text)
    })

    test('resolves to literal world transforms: base placements stay local, the lid placement follows the hinge', () => {
      const { configuration } = accepted(text)
      const world = (pose: 'OPEN' | 'CLOSED', id: string) =>
        resolve(configuration, enclosureOf(configuration), catalog.components, pose).placements.find(p => p.id === id)!
      for (const pose of POSES) expect(world(pose, 'pi').position).toEqual([-140, 20, -80])
      expect(world('CLOSED', 'display').position).toEqual([-82, 64, 20])
      // OPEN is a -90 degree turn about +X through pivot [0, 137.175, 0.625], computed by hand.
      world('OPEN', 'display').position.forEach((v, i) => expect(v).toBeCloseTo([-82, 156.55, 73.8][i], 9))
    })
  })

  describe('frozen v1', () => {
    const text = read('snapshot-v1.frozen.json')

    test('imports with a migration notice and the file timestamps', () => {
      const { configuration, notices, sourceVersion } = accepted(text)
      expect(sourceVersion).toBe(1)
      expect(notices.join('\n')).toMatch(/Migrated from schema version 1 to 2/)
      expect(notices.join('\n')).toMatch(/No keys were dropped/)
      expect(configuration.schemaVersion).toBe(2)
      expect(configuration.createdAt).toBe('2026-10-07T00:00:00.000Z')
      expect(configuration.modifiedAt).toBe('2026-10-07T00:00:00.000Z')
    })

    test.each(POSES)('resolved transforms in %s are unchanged: literal v1 positions on an identity base', pose => {
      const { configuration } = accepted(text)
      const resolved = resolve(configuration, enclosureOf(configuration), catalog.components, pose)
      expect(resolved.bodies.base).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0, 1] })
      expect(resolved.placements.map(({ id, position, rotation }) => ({ id, position, rotation }))).toEqual([
        { id: 'keyboard', position: [25, 5, 0], rotation: [0, 0, 0, 1] },
        { id: 'pi', position: [20, 125, 0], rotation: [0, 0, 0, 1] },
        { id: 'power', position: [160, 140, 0], rotation: [0, 0, 0, 1] },
        { id: 'display', position: [67, 60, 90], rotation: [0, 0, 0, 1] },
      ])
      expect(configuration.placements.map(p => p.attachment)).toEqual(['base', 'base', 'base', 'base'])
    })

    test('a v1 file canonicalizes on first export and is then byte-stable', () => {
      const first = serializeSnapshot(accepted(text).configuration)
      expect(first).not.toBe(text)
      const reimport = accepted(first)
      expect(reimport.sourceVersion).toBe(2)
      expect(serializeSnapshot(reimport.configuration)).toBe(first)
    })
  })

  test('frozen v1 with extra keys imports and names each dropped key', () => {
    const { configuration, notices } = accepted(read('snapshot-v1-extra-keys.frozen.json'))
    const text = notices.join('\n')
    expect(text).toMatch(/Dropped keys not in schema version 1: /)
    for (const key of ['notes', 'enclosure.sku', 'placements[1].label', 'placements[0].component.vendor']) expect(text).toContain(key)
    expect(JSON.stringify(configuration)).not.toMatch(/Hand-kept|BOX-1|Compute|Adafruit"/)
  })
})
