import { describe, expect, test } from 'vitest'
import { ConfigurationV2 } from './articulated'
import { serializeSnapshot } from './snapshot'

const sample = (): ConfigurationV2 => ConfigurationV2.parse({
  schemaVersion: 2,
  units: 'mm',
  coordinateSystem: 'right-handed-z-up',
  enclosure: { id: 'case-2800-preview', revision: 1 },
  base: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
  placements: [
    { id: 'pi', component: { id: 'raspberry-pi-5', revision: 1 }, attachment: 'base', position: [1.5, -0, 1e-7], rotation: [0, 0, 0, 1] },
    { id: 'display', component: { id: 'hoysond-7in-touch', revision: 1 }, attachment: 'lid', position: [-82, 64, 20], rotation: [1, 0, 0, 0] },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  modifiedAt: '2026-01-02T00:00:00.000Z',
})

const GOLDEN = `{
  "base": {
    "position": [0, 0, 0],
    "rotation": [0, 0, 0, 1]
  },
  "coordinateSystem": "right-handed-z-up",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "enclosure": {
    "id": "case-2800-preview",
    "revision": 1
  },
  "modifiedAt": "2026-01-02T00:00:00.000Z",
  "placements": [
    {
      "attachment": "base",
      "component": {
        "id": "raspberry-pi-5",
        "revision": 1
      },
      "id": "pi",
      "position": [1.5, -0, 1e-7],
      "rotation": [0, 0, 0, 1]
    },
    {
      "attachment": "lid",
      "component": {
        "id": "hoysond-7in-touch",
        "revision": 1
      },
      "id": "display",
      "position": [-82, 64, 20],
      "rotation": [1, 0, 0, 0]
    }
  ],
  "schemaVersion": 2,
  "units": "mm"
}
`

/** Rebuilds a JSON-like value with every object's keys in reverse insertion order. */
const reverseKeys = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(reverseKeys)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)]))
  return v
}

describe('canonical snapshot serialization', () => {
  test('produces exact canonical bytes: sorted keys, 2-space indent, inline number arrays, LF, trailing newline', () => {
    expect(serializeSnapshot(sample())).toBe(GOLDEN)
  })

  test('does not depend on the key order of the configuration object', () => {
    const permuted = reverseKeys(sample()) as ConfigurationV2
    expect(Object.keys(permuted)).not.toEqual(Object.keys(sample()))
    expect(serializeSnapshot(permuted)).toBe(GOLDEN)
  })

  test('is byte-stable and keeps every stored number, including signed zero, through JSON', () => {
    const once = serializeSnapshot(sample())
    const reread = JSON.parse(once) as ConfigurationV2
    expect(Object.is(reread.placements[0].position[1], -0)).toBe(true)
    expect(reread).toEqual(sample())
    expect(serializeSnapshot(reread)).toBe(once)
  })

  test('refuses to serialize a configuration that does not satisfy the strict schema', () => {
    expect(() => serializeSnapshot({ ...sample(), units: 'in' } as unknown as ConfigurationV2)).toThrow(/units/)
    expect(() => serializeSnapshot({ ...sample(), pose: 'OPEN' } as unknown as ConfigurationV2)).toThrow()
  })
})
