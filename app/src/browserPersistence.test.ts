import { describe, expect, test } from 'vitest'
import { QUARANTINE_PREFIX, STORAGE_KEY, browserStorage, createBrowserPersistence, type StorageLike } from './browserPersistence'
import { articulatedDeck } from './articulatedFixture'
import { catalog } from './catalog'
import { deck001 } from './fixtures'
import { serializeSnapshot } from './domain/snapshot'
import type { ConfigurationV2 } from './domain/articulated'

class FakeStorage implements StorageLike {
  data = new Map<string, string>()
  writes: string[] = []
  removes: string[] = []
  failWrite: (key: string) => boolean = () => false
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null }
  setItem(key: string, value: string) {
    if (this.failWrite(key)) throw new Error(`quota exceeded for ${key}`)
    this.writes.push(key)
    this.data.set(key, value)
  }
  removeItem(key: string) { this.removes.push(key); this.data.delete(key) }
}

const canonical = serializeSnapshot(articulatedDeck)
const edited: ConfigurationV2 = { ...articulatedDeck, modifiedAt: '2026-11-08T12:00:00.000Z', placements: articulatedDeck.placements.map(p => p.id === 'pi' ? { ...p, position: [1, 2, 3] } : p) }
const setup = (initial?: string) => {
  const storage = new FakeStorage()
  if (initial !== undefined) storage.data.set(STORAGE_KEY, initial)
  return { storage, persistence: createBrowserPersistence(storage, catalog) }
}
const CORRUPT = '{"schemaVersion":2,"units":"mm"'

describe('load', () => {
  test('without browser storage there is nothing to restore and nothing to report', () => {
    const persistence = createBrowserPersistence(null, catalog)
    expect(persistence.load()).toEqual({ configuration: null, notices: [] })
  })

  test('an empty store loads nothing, reports nothing and writes nothing', () => {
    const { storage, persistence } = setup()
    expect(persistence.load()).toEqual({ configuration: null, notices: [] })
    expect(storage.writes).toEqual([])
    expect(storage.removes).toEqual([])
  })

  test('a stored canonical snapshot restores exactly, with no writes', () => {
    const { storage, persistence } = setup(canonical)
    const result = persistence.load()
    expect(result.configuration).toEqual(articulatedDeck)
    expect(result.notices).toEqual([])
    expect(storage.writes).toEqual([])
  })

  test('a stored v1 value restores through the same codec and reports the migration', () => {
    const { persistence } = setup(JSON.stringify(deck001))
    const result = persistence.load()
    expect(result.configuration?.schemaVersion).toBe(2)
    expect(result.notices.join('\n')).toMatch(/Migrated from schema version 1 to 2/)
  })

  test.each([
    ['truncated JSON', CORRUPT, /not valid JSON/],
    ['unknown version', '{"schemaVersion":99}', /Unsupported schemaVersion 99/],
    ['wrong units', JSON.stringify({ ...articulatedDeck, units: 'in' }), /units: "in"/],
    ['catalog revision absent', JSON.stringify({ ...articulatedDeck, enclosure: { id: 'case-2800-preview', revision: 9 } }), /case-2800-preview@9 is not in the catalog/],
  ])('%s: never returned as a design, reported, and left byte-identical with no writes', (_, value, reason) => {
    const { storage, persistence } = setup(value)
    const result = persistence.load()
    expect(result.configuration).toBeNull()
    const notice = result.notices.join('\n')
    expect(notice).toMatch(/could not be loaded/)
    expect(notice).toContain('fixture')
    expect(notice).toContain(STORAGE_KEY)
    expect(notice).toMatch(reason)
    expect(storage.data.get(STORAGE_KEY)).toBe(value)
    expect(storage.writes).toEqual([])
    expect(storage.removes).toEqual([])
  })

  test('storage that throws on read falls back and reports the failure', () => {
    const storage = new FakeStorage()
    storage.getItem = () => { throw new Error('denied') }
    const result = createBrowserPersistence(storage, catalog).load()
    expect(result.configuration).toBeNull()
    expect(result.notices.join('\n')).toMatch(/unavailable.*denied/)
  })
})

describe('save', () => {
  test('writes the canonical snapshot text once and nothing else', () => {
    const { storage, persistence } = setup()
    const result = persistence.save(edited)
    expect(result).toEqual({ saved: true, notices: [] })
    expect(storage.writes).toEqual([STORAGE_KEY])
    expect(storage.data.get(STORAGE_KEY)).toBe(serializeSnapshot(edited))
    expect(storage.data.size).toBe(1)
  })

  test('replaces a readable stored value without keeping a copy', () => {
    const { storage, persistence } = setup(canonical)
    expect(persistence.save(edited)).toEqual({ saved: true, notices: [] })
    expect(storage.data.get(STORAGE_KEY)).toBe(serializeSnapshot(edited))
    expect([...storage.data.keys()]).toEqual([STORAGE_KEY])
  })

  test('a corrupt stored value is quarantined byte-identically before anything is written over it', () => {
    const { storage, persistence } = setup(CORRUPT)
    const result = persistence.save(edited)
    expect(result.saved).toBe(true)
    expect(result.notices.join('\n')).toContain(`${QUARANTINE_PREFIX}0`)
    expect(storage.data.get(`${QUARANTINE_PREFIX}0`)).toBe(CORRUPT)
    expect(storage.writes).toEqual([`${QUARANTINE_PREFIX}0`, STORAGE_KEY])
    expect(storage.data.get(STORAGE_KEY)).toBe(serializeSnapshot(edited))
  })

  test('a corrupt value reappearing after an earlier save is quarantined separately, never overwriting older quarantine', () => {
    const { storage, persistence } = setup(CORRUPT)
    persistence.save(edited)
    storage.data.set(STORAGE_KEY, 'second corrupt value')
    const result = persistence.save(edited)
    expect(result.saved).toBe(true)
    expect(result.notices.join('\n')).toContain(`${QUARANTINE_PREFIX}1`)
    expect(storage.data.get(`${QUARANTINE_PREFIX}0`)).toBe(CORRUPT)
    expect(storage.data.get(`${QUARANTINE_PREFIX}1`)).toBe('second corrupt value')
  })

  test('if the corrupt value cannot be preserved, nothing overwrites it and the save fails visibly', () => {
    const { storage, persistence } = setup(CORRUPT)
    storage.failWrite = key => key.startsWith(QUARANTINE_PREFIX)
    const result = persistence.save(edited)
    expect(result.saved).toBe(false)
    expect(result.notices.join('\n')).toMatch(/quota exceeded/)
    expect(storage.data.get(STORAGE_KEY)).toBe(CORRUPT)
    expect(storage.writes).toEqual([])
  })

  test('if the quarantine copy cannot be verified, nothing overwrites the corrupt value', () => {
    const { storage, persistence } = setup(CORRUPT)
    const real = storage.setItem.bind(storage)
    storage.setItem = (key, value) => real(key, key.startsWith(QUARANTINE_PREFIX) ? `${value}-damaged` : value)
    const result = persistence.save(edited)
    expect(result.saved).toBe(false)
    expect(storage.data.get(STORAGE_KEY)).toBe(CORRUPT)
  })

  test('a storage quota failure is reported and the previous valid value stays', () => {
    const { storage, persistence } = setup(canonical)
    storage.failWrite = () => true
    const result = persistence.save(edited)
    expect(result.saved).toBe(false)
    expect(result.notices.join('\n')).toMatch(/Could not save.*quota exceeded/)
    expect(storage.data.get(STORAGE_KEY)).toBe(canonical)
  })

  test('without browser storage a save reports that nothing was saved', () => {
    expect(createBrowserPersistence(null, catalog).save(edited).saved).toBe(false)
  })
})

describe('clear', () => {
  test('a readable stored value is removed, with no writes', () => {
    const { storage, persistence } = setup(canonical)
    expect(persistence.clear()).toEqual({ cleared: true, notices: [] })
    expect(storage.data.has(STORAGE_KEY)).toBe(false)
    expect(storage.writes).toEqual([])
    expect(storage.removes).toEqual([STORAGE_KEY])
  })

  test('an empty store does nothing', () => {
    const { storage, persistence } = setup()
    expect(persistence.clear()).toEqual({ cleared: true, notices: [] })
    expect(storage.writes).toEqual([])
    expect(storage.removes).toEqual([])
  })

  test('a corrupt value is quarantined before removal', () => {
    const { storage, persistence } = setup(CORRUPT)
    const result = persistence.clear()
    expect(result.cleared).toBe(true)
    expect(result.notices.join('\n')).toContain(`${QUARANTINE_PREFIX}0`)
    expect(storage.data.get(`${QUARANTINE_PREFIX}0`)).toBe(CORRUPT)
    expect(storage.data.has(STORAGE_KEY)).toBe(false)
  })

  test('if the corrupt value cannot be preserved it stays in place', () => {
    const { storage, persistence } = setup(CORRUPT)
    storage.failWrite = () => true
    const result = persistence.clear()
    expect(result.cleared).toBe(false)
    expect(storage.data.get(STORAGE_KEY)).toBe(CORRUPT)
    expect(storage.removes).toEqual([])
  })
})

describe('browserStorage', () => {
  test('returns null where localStorage does not exist', () => {
    expect(browserStorage()).toBeNull()
  })

  test('returns null where accessing localStorage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied') } })
    try {
      expect(browserStorage()).toBeNull()
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage
    }
  })
})
