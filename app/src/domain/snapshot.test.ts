import { describe, expect, test } from 'vitest'
import { ConfigurationV2, POSES, migrateV1ToV2, resolve } from './articulated'
import { MAX_SNAPSHOT_BYTES, parseSnapshot, serializeSnapshot } from './snapshot'
import { catalog } from '../catalog'
import { articulatedDeck } from '../articulatedFixture'
import { deck001 } from '../fixtures'

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

describe('parseSnapshot file gate', () => {
  const rejected = (text: string) => {
    const result = parseSnapshot(text, catalog)
    if (result.ok) throw new Error(`expected rejection, got ${JSON.stringify(result)}`)
    return result.errors.join('\n')
  }

  test('rejects non-JSON text with a readable message', () => {
    expect(rejected('not json at all')).toMatch(/not valid JSON/i)
    expect(rejected('')).toMatch(/not valid JSON/i)
    expect(rejected('{"schemaVersion":2,')).toMatch(/not valid JSON/i)
  })

  test('rejects oversized input by UTF-8 byte length before parsing it', () => {
    const atLimit = `"${'x'.repeat(MAX_SNAPSHOT_BYTES - 2)}"`
    expect(rejected(atLimit)).not.toMatch(/too large/i)
    expect(rejected(`${atLimit} `)).toMatch(/too large.*1048577 bytes.*limit is 1048576 bytes/i)
    expect(rejected(`"${'é'.repeat(MAX_SNAPSHOT_BYTES / 2)}"`)).toMatch(/too large/i)
  })

  test.each([['array', '[]'], ['null', 'null'], ['string', '"x"'], ['number', '3']])('rejects a %s document: only JSON objects are snapshots', (_, text) => {
    expect(rejected(text)).toMatch(/JSON object/i)
  })

  test.each([
    ['missing', '{}', /Missing schemaVersion/],
    ['unknown number', '{"schemaVersion":3}', /Unsupported schemaVersion 3\b/],
    ['string', '{"schemaVersion":"2"}', /Unsupported schemaVersion "2"/],
    ['null', '{"schemaVersion":null}', /Unsupported schemaVersion null/],
    ['float', '{"schemaVersion":2.5}', /Unsupported schemaVersion 2\.5/],
  ])('rejects a %s schemaVersion and lists the supported versions', (_, text, message) => {
    const errors = rejected(text)
    expect(errors).toMatch(message)
    expect(errors).toMatch(/Supported versions: 1, 2/)
  })
})

type Doc = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const deckDoc = () => structuredClone(articulatedDeck) as Doc
const parseDoc = (doc: unknown) => parseSnapshot(JSON.stringify(doc), catalog)
const errorsFor = (doc: unknown) => {
  const result = parseDoc(doc)
  if (result.ok) throw new Error(`expected rejection, got ${JSON.stringify(result.configuration)}`)
  return result.errors.join('\n')
}

describe('strict v2 parsing', () => {
  test('accepts a valid v2 document and preserves its timestamps exactly', () => {
    const doc = { ...deckDoc(), createdAt: '2026-03-04T05:06:07Z', modifiedAt: '2026-05-06T07:08:09.123Z' }
    const result = parseDoc(doc)
    if (!result.ok) throw new Error(result.errors.join('\n'))
    expect(result.sourceVersion).toBe(2)
    expect(result.notices).toEqual([])
    expect(result.configuration).toEqual(doc)
    expect(result.configuration.createdAt).toBe('2026-03-04T05:06:07Z')
    expect(result.configuration.modifiedAt).toBe('2026-05-06T07:08:09.123Z')
  })

  test('a differently formatted v2 source imports to the same design and canonicalizes on first export', () => {
    const minified = JSON.stringify(reverseKeys(articulatedDeck))
    const result = parseSnapshot(minified, catalog)
    if (!result.ok) throw new Error(result.errors.join('\n'))
    expect(result.configuration).toEqual(articulatedDeck)
    const canonical = serializeSnapshot(result.configuration)
    expect(canonical).not.toBe(minified)
    expect(canonical).toBe(serializeSnapshot(articulatedDeck))
    const again = parseSnapshot(canonical, catalog)
    if (!again.ok) throw new Error(again.errors.join('\n'))
    expect(serializeSnapshot(again.configuration)).toBe(canonical)
  })

  test.each<[string, (d: Doc) => void, RegExp]>([
    ['wrong units', d => { d.units = 'in' }, /units: "in" is not supported.*"mm".*never guessed/],
    ['missing units', d => { delete d.units }, /units: missing.*"mm".*never guessed/],
    ['wrong coordinate system', d => { d.coordinateSystem = 'left-handed-y-up' }, /coordinateSystem: .*right-handed-z-up/],
    ['non-unit quaternion in a placement', d => { d.placements[1].rotation = [0, 0, 0, 2] }, /placements\[1\]\.rotation: rotation must be a unit quaternion/],
    ['non-unit base quaternion', d => { d.base.rotation = [1, 1, 0, 0] }, /base\.rotation: rotation must be a unit quaternion/],
    ['non-finite position via 1e999', d => { d.placements[0].position = '__1e999__' }, /placements\[0\]\.position/],
    ['short position', d => { d.placements[0].position = [1, 2] }, /placements\[0\]\.position/],
    ['unknown top-level key', d => { d.pose = 'OPEN' }, /Unknown key: pose/],
    ['unknown key inside a placement', d => { d.placements[2].note = 'x' }, /Unknown key: placements\[2\]\.note/],
    ['unknown key inside a component ref', d => { d.placements[0].component.sku = 'x' }, /Unknown key: placements\[0\]\.component\.sku/],
    ['unknown key inside the base transform', d => { d.base.scale = 2 }, /Unknown key: base\.scale/],
    ['unknown key inside the enclosure ref', d => { d.enclosure.extra = 1 }, /Unknown key: enclosure\.extra/],
    ['prototype-shaped key', d => { Object.defineProperty(d, '__proto__', { value: { x: 1 }, enumerable: true, configurable: true }) }, /Unknown key: __proto__/],
    ['bad attachment', d => { d.placements[0].attachment = 'hinge' }, /placements\[0\]\.attachment/],
    ['non-integer revision', d => { d.enclosure.revision = 1.5 }, /enclosure\.revision/],
    ['bad timestamp', d => { d.modifiedAt = 'yesterday' }, /modifiedAt/],
  ])('rejects %s with a specific message', (_, mutate, message) => {
    const doc = deckDoc()
    mutate(doc)
    const text = JSON.stringify(doc).replace('"__1e999__"', '[1e999,0,0]')
    const result = parseSnapshot(text, catalog)
    if (result.ok) throw new Error(`expected rejection for ${text.slice(0, 80)}`)
    expect(result.errors.join('\n')).toMatch(message)
  })

  test('several unknown keys in one object are each named', () => {
    const errors = errorsFor({ ...deckDoc(), pose: 'OPEN', selectedId: 'pi' })
    expect(errors).toMatch(/Unknown key: pose/)
    expect(errors).toMatch(/Unknown key: selectedId/)
  })

  test('never mutates or retains the parsed text: repeated parsing gives equal, independent results', () => {
    const text = serializeSnapshot(articulatedDeck)
    const a = parseSnapshot(text, catalog), b = parseSnapshot(text, catalog)
    if (!a.ok || !b.ok) throw new Error('expected accepted')
    expect(a.configuration).toEqual(b.configuration)
    expect(a.configuration).not.toBe(b.configuration)
    expect(a.configuration.placements).not.toBe(b.configuration.placements)
  })
})

describe('placement id uniqueness', () => {
  test('rejects duplicate placement ids and names the duplicated id', () => {
    const doc = deckDoc()
    doc.placements[2].id = doc.placements[0].id
    const errors = errorsFor(doc)
    expect(errors).toMatch(/placements: duplicate placement id: "keyboard"/)
  })

  test('names every duplicated id once', () => {
    const doc = deckDoc()
    doc.placements = [doc.placements[0], doc.placements[0], doc.placements[0], doc.placements[1], doc.placements[1]]
    expect(errorsFor(doc).match(/duplicate placement id: "keyboard", "pi"/)).not.toBeNull()
  })
})

describe('exact catalog revisions', () => {
  const withPi2 = () => {
    const components = new Map(catalog.components)
    const pi = components.get('raspberry-pi-5@1')!
    components.set('raspberry-pi-5@2', { ...pi, revision: 2 })
    return { ...catalog, components }
  }

  test('rejects a component revision that does not exist and lists what does', () => {
    const doc = deckDoc()
    doc.placements[1].component.revision = 9
    const errors = errorsFor(doc)
    expect(errors).toMatch(/placements\[1\]\.component: raspberry-pi-5@9 is not in the catalog/)
    expect(errors).toMatch(/Available revisions of raspberry-pi-5: 1\b/)
    expect(errors).toMatch(/never upgraded/)
  })

  test('rejects an enclosure revision that does not exist', () => {
    const doc = deckDoc()
    doc.enclosure.revision = 2
    const errors = errorsFor(doc)
    expect(errors).toMatch(/enclosure: case-2800-preview@2 is not in the catalog/)
    expect(errors).toMatch(/Available revisions of case-2800-preview: 1\b/)
  })

  test('reports an unknown id distinctly from an unknown revision', () => {
    const doc = deckDoc()
    doc.placements[0].component.id = 'no-such-part'
    expect(errorsFor(doc)).toMatch(/no-such-part@1 is not in the catalog\. No revisions of no-such-part exist/)
    const box = deckDoc()
    box.enclosure.id = 'no-such-case'
    expect(errorsFor(box)).toMatch(/enclosure: no-such-case@1 is not in the catalog\. No revisions of no-such-case exist/)
  })

  test('a reference is kept at the exact file revision even when a newer revision exists', () => {
    const result = parseSnapshot(JSON.stringify(deckDoc()), withPi2())
    if (!result.ok) throw new Error(result.errors.join('\n'))
    expect(result.configuration.placements.find(p => p.id === 'pi')!.component).toEqual({ id: 'raspberry-pi-5', revision: 1 })
  })

  test('a newer revision is honoured only when the file names it, and an older one still resolves', () => {
    const doc = deckDoc()
    doc.placements[1].component.revision = 2
    const result = parseSnapshot(JSON.stringify(doc), withPi2())
    if (!result.ok) throw new Error(result.errors.join('\n'))
    expect(result.configuration.placements.find(p => p.id === 'pi')!.component.revision).toBe(2)
    const missing = deckDoc()
    missing.placements[1].component.revision = 3
    const rejected = parseSnapshot(JSON.stringify(missing), withPi2())
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect(rejected.errors.join('\n')).toMatch(/Available revisions of raspberry-pi-5: 1, 2\b/)
  })
})

describe('resolution in every supported pose', () => {
  const finite = (v: readonly number[]) => v.every(Number.isFinite)

  test('supported poses are exactly OPEN and CLOSED', () => {
    expect(POSES).toEqual(['OPEN', 'CLOSED'])
  })

  test('an accepted v2 document resolves to finite transforms in every pose', () => {
    const result = parseDoc(deckDoc())
    if (!result.ok) throw new Error(result.errors.join('\n'))
    const enclosure = catalog.enclosures.get('case-2800-preview@1')!
    for (const pose of POSES) {
      const resolved = resolve(result.configuration, enclosure, catalog.components, pose)
      expect(resolved.placements).toHaveLength(4)
      for (const t of [...resolved.placements, resolved.bodies.base, resolved.bodies.lid]) {
        expect(finite(t.position) && finite(t.rotation)).toBe(true)
      }
    }
  })

  test('a lid attachment against a box enclosure is rejected, naming the placement and enclosure', () => {
    const doc = deckDoc()
    doc.enclosure = { id: 'placeholder-box', revision: 1 }
    expect(errorsFor(doc)).toMatch(/pose OPEN: Box enclosure placeholder-box@1 has no lid; placement "display" is attached to lid/)
  })

  test('a box enclosure with only base attachments is accepted', () => {
    const doc = deckDoc()
    doc.enclosure = { id: 'placeholder-box', revision: 1 }
    doc.placements = doc.placements.filter((p: { attachment: string }) => p.attachment === 'base')
    expect(parseDoc(doc).ok).toBe(true)
  })

  test('a transform that overflows only in the CLOSED pose is rejected: every pose is checked, not just the first', () => {
    const doc = deckDoc()
    doc.base = { position: [0, 1.7e308, 0], rotation: [0, 0, 0, 1] }
    doc.placements = [{ ...doc.placements[3], position: [0, 1.7e308, 0], rotation: [0, 0, 0, 1] }]
    expect(POSES[0]).toBe('OPEN')
    const c = ConfigurationV2.parse(doc)
    const enclosure = catalog.enclosures.get('case-2800-preview@1')!
    expect(resolve(c, enclosure, catalog.components, 'OPEN').placements[0].position.every(Number.isFinite)).toBe(true)
    expect(resolve(c, enclosure, catalog.components, 'CLOSED').placements[0].position.every(Number.isFinite)).toBe(false)
    expect(errorsFor(doc)).toMatch(/pose CLOSED: placement "display" has a non-finite world transform/)
  })
})

describe('v1 migration', () => {
  const v1Doc = () => structuredClone(deck001) as Doc

  test('migrates a v1 file to v2, preserving timestamps and using the current migration path', () => {
    const doc = { ...v1Doc(), createdAt: '2026-01-02T03:04:05Z', modifiedAt: '2026-06-07T08:09:10.500Z' }
    const result = parseDoc(doc)
    if (!result.ok) throw new Error(result.errors.join('\n'))
    expect(result.sourceVersion).toBe(1)
    expect(result.configuration).toEqual(migrateV1ToV2(doc as typeof deck001))
    expect(result.configuration.schemaVersion).toBe(2)
    expect(result.configuration.createdAt).toBe('2026-01-02T03:04:05Z')
    expect(result.configuration.modifiedAt).toBe('2026-06-07T08:09:10.500Z')
  })

  test.each(POSES)('resolved transforms in %s are unchanged by import and by the migration path', pose => {
    const result = parseDoc(v1Doc())
    if (!result.ok) throw new Error(result.errors.join('\n'))
    const enclosure = catalog.enclosures.get(`${deck001.enclosure.id}@${deck001.enclosure.revision}`)!
    const viaImport = resolve(result.configuration, enclosure, catalog.components, pose)
    expect(viaImport).toEqual(resolve(migrateV1ToV2(deck001), enclosure, catalog.components, pose))
    // Independent of the migration code: base is identity, so world equals the stored v1 local transform.
    expect(viaImport.placements.map(({ id, position, rotation }) => ({ id, position, rotation })))
      .toEqual(deck001.placements.map(({ id, position, rotation }) => ({ id, position, rotation })))
  })

  test('always reports the migration, and reports when nothing was dropped', () => {
    const result = parseDoc(v1Doc())
    if (!result.ok) throw new Error(result.errors.join('\n'))
    const notices = result.notices.join('\n')
    expect(notices).toMatch(/Migrated from schema version 1 to 2/)
    expect(notices).toMatch(/every placement is attached to base/i)
    expect(notices).toMatch(/No keys were dropped/)
  })

  test('names every dropped key with its path, including prototype-shaped keys', () => {
    const doc = v1Doc()
    doc.notes = 'scratch'
    doc.enclosure.sku = 'abc'
    doc.placements[1].label = 'Pi'
    doc.placements[0].component.vendor = 'adafruit'
    doc.placements[2].attachment = 'lid'
    Object.defineProperty(doc, '__proto__', { value: { evil: true }, enumerable: true, configurable: true })
    const result = parseDoc(doc)
    if (!result.ok) throw new Error(result.errors.join('\n'))
    const notices = result.notices.join('\n')
    expect(notices).toMatch(/Dropped keys not in schema version 1: .*\bnotes\b/)
    for (const key of ['enclosure.sku', 'placements[1].label', 'placements[0].component.vendor', 'placements[2].attachment', '__proto__']) expect(notices).toContain(key)
    expect(result.configuration.placements[2].attachment).toBe('base')
    expect(JSON.stringify(result.configuration)).not.toMatch(/notes|sku|label|vendor|evil/)
  })

  test.each<[string, (d: Doc) => void, RegExp]>([
    ['wrong units', d => { d.units = 'cm' }, /units: "cm" is not supported/],
    ['non-unit quaternion', d => { d.placements[0].rotation = [0, 0, 0, 3] }, /placements\[0\]\.rotation: rotation must be a unit quaternion/],
    ['duplicate placement ids', d => { d.placements[1].id = d.placements[0].id }, /duplicate placement id: "keyboard"/],
    ['missing component revision', d => { d.placements[3].component.revision = 7 }, /placements\[3\]\.component: hoysond-7in-touch@7 is not in the catalog/],
    ['missing enclosure revision', d => { d.enclosure.revision = 7 }, /enclosure: placeholder-box@7 is not in the catalog/],
  ])('rejects a v1 file with %s using the same specific rule', (_, mutate, message) => {
    const doc = v1Doc()
    mutate(doc)
    expect(errorsFor(doc)).toMatch(message)
  })
})
