// Browser persistence for the single current design. Deliberately outside domain/.
// The stored value is the canonical snapshot text, read back through the same codec as an imported
// file, so a stored value gets exactly the same validation as an untrusted one.
import type { ConfigurationV2 } from './domain/articulated'
import { parseSnapshot, serializeSnapshot, type SnapshotCatalog } from './domain/snapshot'

export const STORAGE_KEY = 'sidequest-decks:configuration'
export const QUARANTINE_PREFIX = `${STORAGE_KEY}:quarantine:`

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface LoadResult { configuration: ConfigurationV2 | null; notices: string[] }
export interface SaveResult { saved: boolean; notices: string[] }
export interface ClearResult { cleared: boolean; notices: string[] }

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function createBrowserPersistence(storage: StorageLike | null, catalog: SnapshotCatalog) {
  const unreadable = (value: string) => !parseSnapshot(value, catalog).ok

  /** Copies an unreadable value to a new key, verifies the copy, and never reuses an existing key. */
  function quarantine(s: StorageLike, value: string): string {
    let n = 0
    while (s.getItem(`${QUARANTINE_PREFIX}${n}`) !== null) n++
    const key = `${QUARANTINE_PREFIX}${n}`
    s.setItem(key, value)
    if (s.getItem(key) !== value) throw new Error('the preserved copy could not be verified')
    return key
  }

  const preservedNotice = (key: string) => `The unreadable saved configuration was preserved unchanged under browser-storage key "${key}".`

  /** Read-only: an unreadable value is reported and left in place until the next committed change. */
  function load(): LoadResult {
    if (!storage) return { configuration: null, notices: [] }
    let stored: string | null
    try {
      stored = storage.getItem(STORAGE_KEY)
    } catch (error) {
      return { configuration: null, notices: [`Browser storage is unavailable, so the fixture is shown and changes stay in this tab: ${messageOf(error)}.`] }
    }
    if (stored === null) return { configuration: null, notices: [] }
    const parsed = parseSnapshot(stored, catalog)
    if (parsed.ok) return { configuration: parsed.configuration, notices: parsed.notices }
    return {
      configuration: null,
      notices: [`The saved configuration in this browser could not be loaded, so the fixture is shown. The saved value has not been changed; it stays under browser-storage key "${STORAGE_KEY}". Reason: ${parsed.errors.join(' ')}`],
    }
  }

  /** Writes one committed design. A value already there that cannot be loaded is preserved first. */
  function save(configuration: ConfigurationV2): SaveResult {
    if (!storage) return { saved: false, notices: [] }
    try {
      const existing = storage.getItem(STORAGE_KEY)
      const notices = existing !== null && unreadable(existing) ? [preservedNotice(quarantine(storage, existing))] : []
      storage.setItem(STORAGE_KEY, serializeSnapshot(configuration))
      return { saved: true, notices }
    } catch (error) {
      return { saved: false, notices: [`Could not save to this browser: ${messageOf(error)}. The configuration stays in memory only and reloading discards it.`] }
    }
  }

  /** Removes the saved design for a reset to the fixture. A value that cannot be loaded is preserved first. */
  function clear(): ClearResult {
    if (!storage) return { cleared: true, notices: [] }
    try {
      const existing = storage.getItem(STORAGE_KEY)
      if (existing === null) return { cleared: true, notices: [] }
      const notices = unreadable(existing) ? [preservedNotice(quarantine(storage, existing))] : []
      storage.removeItem(STORAGE_KEY)
      return { cleared: true, notices }
    } catch (error) {
      return { cleared: false, notices: [`Could not clear the saved configuration in this browser: ${messageOf(error)}. The saved value was left in place.`] }
    }
  }

  return { load, save, clear }
}
