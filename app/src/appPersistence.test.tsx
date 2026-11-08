// @vitest-environment jsdom
// Mounted persistence flows: real React DOM, real App state, real list/panel/pose controls under
// StrictMode (as in main.tsx). Fakes are limited to browser storage and the clock; jsdom has no
// WebGL, so the Viewport is the same stand-in as workbenchInteraction.test.tsx uses.
import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Viewport as RealViewport } from './scene/Viewport'
import { QUARANTINE_PREFIX, STORAGE_KEY, type StorageLike } from './browserPersistence'
import { articulatedDeck } from './articulatedFixture'
import { catalog } from './catalog'
import { MAX_SNAPSHOT_BYTES, parseSnapshot, serializeSnapshot } from './domain/snapshot'
import { deck001 } from './fixtures'

type ViewportProps = Parameters<typeof RealViewport>[0]
vi.mock('./scene/Viewport', () => ({
  Viewport: ({ configuration, selectedId, onSelect }: ViewportProps) => (
    <div data-testid="viewport">
      {configuration.placements.map(p => (
        <button key={p.id} type="button" data-mesh={p.id} data-selected={p.id === selectedId} onClick={() => onSelect(p.id)} />
      ))}
    </div>
  ),
}))
const { App } = await import('./App')

// Updates after an awaited file read happen outside flushSync; this suppresses React's act warning.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

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

// jsdom's File has no text(); browsers do. Tests can spy on this to prove a file was not read.
const readFileText = vi.fn(function (this: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(this)
  })
})
Object.defineProperty(File.prototype, 'text', { configurable: true, value: readFileText })

const DISPLAY = 'Hoysond 7" HDMI Touchscreen'
const STAMP = '2026-11-08T12:00:00.000Z'
const act = (fn: () => void) => flushSync(fn)

function mount(storage: FakeStorage, clock: () => string = () => STAMP) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<StrictMode><App storage={storage} clock={clock} /></StrictMode>))
  let mounted = true
  const unmount = () => { if (mounted) { mounted = false; act(() => root.unmount()); host.remove() } }
  cleanups.push(unmount)

  const $ = <T extends Element = HTMLElement>(sel: string) => {
    const el = host.querySelector<T>(sel)
    expect(el, sel).not.toBeNull()
    return el!
  }
  const button = (name: string) => {
    const el = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name)
    expect(el, name).toBeDefined()
    return el!
  }
  const click = (el: HTMLElement) => act(() => el.click())
  const type = (el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
  }
  const input = (axis: 'x' | 'y' | 'z') => $<HTMLInputElement>(`input[name="${axis}"]`)
  return {
    host, unmount, $, button, click, type, input,
    selectDisplay: () => click(button(DISPLAY)),
    apply: () => click(button('Apply position')),
    setX: (x: string) => { type(input('x'), x); click(button('Apply position')) },
    pose: (p: 'OPEN' | 'CLOSED') => click(button(p === 'OPEN' ? 'OPEN · 120°' : 'CLOSED · 210°')),
    stored: () => $('[data-field="position"]').textContent,
    alerts: () => [...host.querySelectorAll('[role="alert"]')].map(a => a.textContent ?? ''),
    statuses: () => [...host.querySelectorAll('[role="status"]')].map(a => a.textContent ?? ''),
    text: () => host.textContent ?? '',
    /** Chooses a file in the native picker and resolves once the App has processed it. */
    chooseFile: async (file: File, done: () => boolean) => {
      const picker = $<HTMLInputElement>('input[type="file"]')
      Object.defineProperty(picker, 'files', { configurable: true, value: [file] })
      act(() => picker.dispatchEvent(new Event('change', { bubbles: true })))
      await vi.waitFor(() => expect(done()).toBe(true))
    },
  }
}

const jsonFile = (text: string, name = 'config.json') => new File([text], name, { type: 'application/json' })

const cleanups: (() => void)[] = []
afterEach(() => { for (const fn of cleanups.splice(0)) fn() })

const parseStored = (storage: FakeStorage, key = STORAGE_KEY) => {
  const text = storage.data.get(key)!
  const result = parseSnapshot(text, catalog)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result.configuration
}

describe('committed edits persist and survive a reload', () => {
  test('mounting writes nothing, shows the fixture and marks nothing unsaved', () => {
    const storage = new FakeStorage()
    const page = mount(storage)
    expect(storage.writes).toEqual([])
    expect(storage.removes).toEqual([])
    expect(page.text()).not.toContain('Unsaved')
    page.selectDisplay()
    expect(page.stored()).toBe('[-82, 64, 20]')
    expect(storage.writes).toEqual([])
  })

  test('an accepted edit writes exactly once, stamps modifiedAt exactly once, and is canonical', () => {
    const storage = new FakeStorage()
    let clockCalls = 0
    const page = mount(storage, () => { clockCalls++; return `2026-11-08T12:00:0${clockCalls}.000Z` })
    page.selectDisplay()
    page.setX('-71.5')
    expect(page.stored()).toBe('[-71.5, 64, 20]')
    expect(storage.writes).toEqual([STORAGE_KEY])
    expect(clockCalls).toBe(1)
    const saved = parseStored(storage)
    expect(saved.modifiedAt).toBe('2026-11-08T12:00:01.000Z')
    expect(saved.createdAt).toBe(articulatedDeck.createdAt)
    expect(saved.placements.find(p => p.id === 'display')!.position).toEqual([-71.5, 64, 20])
    expect(storage.data.get(STORAGE_KEY)).toBe(serializeSnapshot(saved))
    expect(page.text()).not.toContain('Unsaved')
  })

  test('a remount (reload) restores the committed edit without writing or re-stamping', () => {
    const storage = new FakeStorage()
    const page = mount(storage)
    page.selectDisplay()
    page.setX('-71.5')
    const stamped = storage.data.get(STORAGE_KEY)
    page.unmount()

    const reloaded = mount(storage)
    expect(storage.writes).toEqual([STORAGE_KEY])
    reloaded.selectDisplay()
    expect(reloaded.stored()).toBe('[-71.5, 64, 20]')
    expect(storage.data.get(STORAGE_KEY)).toBe(stamped)
  })

  test('pose and selection changes never write or stamp, and the stored design has no view state', () => {
    const storage = new FakeStorage()
    let clockCalls = 0
    const page = mount(storage, () => { clockCalls++; return STAMP })
    page.selectDisplay()
    page.setX('-71.5')
    const stored = storage.data.get(STORAGE_KEY)!
    const writes = storage.writes.length
    const calls = clockCalls

    for (let i = 0; i < 5; i++) {
      page.pose('CLOSED')
      page.pose('OPEN')
      page.click(page.$('[data-mesh="pi"]'))
      page.click(page.button('Raspberry Pi 5'))
      page.selectDisplay()
    }
    expect(storage.writes).toHaveLength(writes)
    expect(clockCalls).toBe(calls)
    expect(storage.data.get(STORAGE_KEY)).toBe(stored)
    expect(stored).not.toMatch(/"pose"|"selected|selectedId|"OPEN"|"CLOSED"/)
  })

  test('rejected and no-op edits write nothing and never stamp', () => {
    const storage = new FakeStorage()
    let clockCalls = 0
    const page = mount(storage, () => { clockCalls++; return STAMP })
    page.selectDisplay()

    page.type(page.input('x'), '')
    page.apply()
    expect(page.alerts().join('\n')).toMatch(/Edit rejected/)
    expect(storage.writes).toEqual([])
    expect(clockCalls).toBe(0)

    page.type(page.input('x'), '-82')
    page.apply()
    expect(page.stored()).toBe('[-82, 64, 20]')
    expect(storage.writes).toEqual([])
    expect(clockCalls).toBe(0)
  })

  test('each further real edit writes once more and advances modifiedAt', () => {
    const storage = new FakeStorage()
    let clockCalls = 0
    const page = mount(storage, () => { clockCalls++; return `2026-11-08T12:00:0${clockCalls}.000Z` })
    page.selectDisplay()
    page.setX('-71.5')
    page.setX('-60')
    expect(storage.writes).toEqual([STORAGE_KEY, STORAGE_KEY])
    expect(clockCalls).toBe(2)
    expect(parseStored(storage).modifiedAt).toBe('2026-11-08T12:00:02.000Z')
  })

  test('a failed save keeps the edit in memory, marks it unsaved and leaves the previous value', () => {
    const storage = new FakeStorage()
    const previous = serializeSnapshot(articulatedDeck)
    storage.data.set(STORAGE_KEY, previous)
    storage.failWrite = () => true
    const page = mount(storage)
    page.selectDisplay()
    page.setX('-71.5')
    expect(page.stored()).toBe('[-71.5, 64, 20]')
    expect(page.text()).toContain('Unsaved')
    expect(page.text()).toMatch(/Could not save/)
    expect(storage.data.get(STORAGE_KEY)).toBe(previous)
  })
})

describe('corrupt stored value', () => {
  const CORRUPT = '{"schemaVersion":2,"units"'

  test('falls back to the fixture with a notice, on every load, and writes nothing', () => {
    const storage = new FakeStorage()
    storage.data.set(STORAGE_KEY, CORRUPT)
    for (let i = 0; i < 2; i++) {
      const page = mount(storage)
      expect(page.alerts().join('\n')).toMatch(/could not be loaded.*fixture/)
      page.selectDisplay()
      expect(page.stored()).toBe('[-82, 64, 20]')
      page.pose('CLOSED')
      expect(storage.writes).toEqual([])
      expect(storage.removes).toEqual([])
      expect(storage.data.get(STORAGE_KEY)).toBe(CORRUPT)
      page.unmount()
    }
  })

  test('the first committed edit preserves the corrupt bytes and then saves; reload restores the edit', () => {
    const storage = new FakeStorage()
    storage.data.set(STORAGE_KEY, CORRUPT)
    const page = mount(storage)
    page.selectDisplay()
    page.setX('-71.5')
    expect(storage.data.get(`${QUARANTINE_PREFIX}0`)).toBe(CORRUPT)
    expect(page.text()).toContain(`${QUARANTINE_PREFIX}0`)
    expect(parseStored(storage).placements.find(p => p.id === 'display')!.position).toEqual([-71.5, 64, 20])
    page.unmount()

    const reloaded = mount(storage)
    expect(reloaded.alerts().join('\n')).not.toMatch(/could not be loaded/)
    reloaded.selectDisplay()
    expect(reloaded.stored()).toBe('[-71.5, 64, 20]')
    expect(storage.data.get(`${QUARANTINE_PREFIX}0`)).toBe(CORRUPT)
  })
})

describe('file export, import and reset', () => {
  const exported = async (page: ReturnType<typeof mount>) => {
    const blobs: Blob[] = []
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { blobs.push(blob as Blob); return 'blob:snapshot' })
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const anchors: { href: string; download: string }[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      anchors.push({ href: this.href, download: this.download })
    })
    try {
      page.click(page.button('Export file'))
      expect(blobs).toHaveLength(1)
      expect(anchors).toEqual([{ href: 'blob:snapshot', download: 'sidequest-configuration.json' }])
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(blobs[0])
      })
    } finally {
      click.mockRestore()
      createObjectURL.mockRestore()
      revokeObjectURL.mockRestore()
    }
  }

  const editedDeck = () => {
    const storage = new FakeStorage()
    const page = mount(storage)
    page.selectDisplay()
    page.setX('-71.5')
    return { storage, page }
  }

  test('export writes the canonical bytes of the current design and changes nothing', async () => {
    const { storage, page } = editedDeck()
    const stored = storage.data.get(STORAGE_KEY)!
    const writes = storage.writes.length
    const text = await exported(page)
    expect(text).toBe(stored)
    expect(storage.writes).toHaveLength(writes)
    expect(storage.data.get(STORAGE_KEY)).toBe(stored)
    expect(page.stored()).toBe('[-71.5, 64, 20]')
  })

  test('export of an unedited fixture is its canonical snapshot and writes nothing', async () => {
    const storage = new FakeStorage()
    const page = mount(storage)
    expect(await exported(page)).toBe(serializeSnapshot(articulatedDeck))
    expect(storage.writes).toEqual([])
  })

  test('a valid v2 import replaces the design, persists it once, keeps the file timestamps and clears the selection', async () => {
    const { storage, page } = editedDeck()
    const file = { ...articulatedDeck, createdAt: '2025-01-02T03:04:05.000Z', modifiedAt: '2025-06-07T08:09:10.000Z', placements: articulatedDeck.placements.map(p => p.id === 'pi' ? { ...p, position: [5, 6, 7] as [number, number, number] } : p) }
    const before = storage.writes.length
    await page.chooseFile(jsonFile(JSON.stringify(file, null, 4), 'friend.json'), () => /Imported friend\.json/.test(page.statuses().join('\n')))
    expect(storage.writes).toHaveLength(before + 1)
    expect(storage.data.get(STORAGE_KEY)).toBe(serializeSnapshot(file))
    const saved = parseStored(storage)
    expect(saved.createdAt).toBe('2025-01-02T03:04:05.000Z')
    expect(saved.modifiedAt).toBe('2025-06-07T08:09:10.000Z')
    expect(page.$('[data-field="createdAt"]').textContent).toBe('2025-01-02T03:04:05.000Z')
    expect(page.$('[data-field="modifiedAt"]').textContent).toBe('2025-06-07T08:09:10.000Z')
    expect(page.host.querySelector('section[aria-label="Selected placement"]')).toBeNull()
    page.selectDisplay()
    expect(page.stored()).toBe('[-82, 64, 20]')
    page.click(page.button('Raspberry Pi 5'))
    expect(page.stored()).toBe('[5, 6, 7]')
  })

  test('import survives a reload and re-exports byte-identically', async () => {
    const storage = new FakeStorage()
    const page = mount(storage)
    const canonical = serializeSnapshot(articulatedDeck)
    await page.chooseFile(jsonFile(canonical), () => /Imported/.test(page.statuses().join('\n')))
    page.unmount()
    const reloaded = mount(storage)
    expect(await exported(reloaded)).toBe(canonical)
  })

  test('v1 import shows a visible migration notice naming dropped keys and persists v2', async () => {
    const { storage, page } = editedDeck()
    const v1 = { ...structuredClone(deck001), legacy: true, placements: deck001.placements.map(p => p.id === 'pi' ? { ...p, label: 'x' } : p) }
    await page.chooseFile(jsonFile(JSON.stringify(v1)), () => /Migrated from schema version 1 to 2/.test(page.statuses().join('\n')))
    const statuses = page.statuses().join('\n')
    expect(statuses).toMatch(/Dropped keys not in schema version 1: /)
    for (const key of ['legacy', 'placements[1].label']) expect(statuses).toContain(key)
    expect(parseStored(storage).schemaVersion).toBe(2)
    expect(parseStored(storage).createdAt).toBe(deck001.createdAt)
    expect(storage.data.get(STORAGE_KEY)).not.toContain('legacy')
  })

  const box = { id: 'placeholder-box', revision: 1 }
  const asDoc = (mutate: (d: Record<string, unknown>) => void) => {
    const doc = structuredClone(articulatedDeck) as unknown as Record<string, unknown>
    mutate(doc)
    return JSON.stringify(doc)
  }
  const place = (d: Record<string, unknown>) => d.placements as Array<Record<string, unknown>>
  const rejectedFiles: [string, string, RegExp][] = [
    ['an unknown schema version', '{"schemaVersion":3}', /Unsupported schemaVersion 3.*Supported versions: 1, 2/],
    ['a missing schema version', '{"units":"mm"}', /Missing schemaVersion.*Supported versions: 1, 2/],
    ['wrong units', asDoc(d => { d.units = 'in' }), /units: "in" is not supported/],
    ['a non-unit quaternion', asDoc(d => { place(d)[0].rotation = [0, 0, 0, 2] }), /placements\[0\]\.rotation: rotation must be a unit quaternion/],
    ['an unknown v2 key', asDoc(d => { d.pose = 'OPEN' }), /Unknown key: pose/],
    ['duplicate placement ids', asDoc(d => { place(d)[1].id = place(d)[0].id }), /duplicate placement id: "keyboard"/],
    ['a missing catalog revision', asDoc(d => { (place(d)[1].component as { revision: number }).revision = 42 }), /raspberry-pi-5@42 is not in the catalog/],
    ['a lid attachment against a box enclosure', asDoc(d => { d.enclosure = box }), /Box enclosure placeholder-box@1 has no lid; placement "display"/],
    ['a non-JSON file', 'this is not json', /not valid JSON/],
  ]
  test.each(rejectedFiles)('rejects %s readably and leaves the loaded configuration and storage unchanged', async (_, text, message) => {
    const { storage, page } = editedDeck()
    const stored = storage.data.get(STORAGE_KEY)
    const writes = storage.writes.length
    const removes = storage.removes.length
    await page.chooseFile(jsonFile(text), () => /Import rejected/.test(page.alerts().join('\n')))
    const alerts = page.alerts().join('\n')
    expect(alerts).toMatch(/Import rejected; configuration unchanged/)
    expect(alerts).toMatch(message)
    expect(storage.data.get(STORAGE_KEY)).toBe(stored)
    expect(storage.writes).toHaveLength(writes)
    expect(storage.removes).toHaveLength(removes)
    expect(page.stored()).toBe('[-71.5, 64, 20]')
    expect(page.$<HTMLInputElement>('input[type="file"]').value).toBe('')
    page.unmount()
    const reloaded = mount(storage)
    reloaded.selectDisplay()
    expect(reloaded.stored()).toBe('[-71.5, 64, 20]')
  })

  test('an oversized file is rejected from its size alone, without reading it', async () => {
    const { storage, page } = editedDeck()
    const stored = storage.data.get(STORAGE_KEY)
    readFileText.mockClear()
    await page.chooseFile(jsonFile('x'.repeat(MAX_SNAPSHOT_BYTES + 1)), () => /too large/.test(page.alerts().join('\n')))
    expect(readFileText).not.toHaveBeenCalled()
    expect(page.alerts().join('\n')).toMatch(/1048577 bytes.*limit is 1048576 bytes/)
    expect(storage.data.get(STORAGE_KEY)).toBe(stored)
    expect(page.stored()).toBe('[-71.5, 64, 20]')
  })

  test('a later accepted import clears the previous rejection', async () => {
    const storage = new FakeStorage()
    const page = mount(storage)
    await page.chooseFile(jsonFile('nope'), () => /Import rejected/.test(page.alerts().join('\n')))
    await page.chooseFile(jsonFile(serializeSnapshot(articulatedDeck)), () => /Imported/.test(page.statuses().join('\n')))
    expect(page.alerts().join('\n')).not.toMatch(/Import rejected/)
  })

  test('the file picker can import the same file twice in a row', async () => {
    const storage = new FakeStorage()
    const page = mount(storage)
    const file = jsonFile(serializeSnapshot(articulatedDeck))
    await page.chooseFile(file, () => /Imported/.test(page.statuses().join('\n')))
    expect(page.$<HTMLInputElement>('input[type="file"]').value).toBe('')
    storage.data.delete(STORAGE_KEY)
    await page.chooseFile(file, () => storage.data.has(STORAGE_KEY))
  })

  test('export -> clear storage -> import gives byte-identical state and survives reload', async () => {
    const { storage, page } = editedDeck()
    const first = await exported(page)
    page.unmount()

    storage.data.clear()
    const fresh = mount(storage)
    fresh.selectDisplay()
    expect(fresh.stored()).toBe('[-82, 64, 20]')
    await fresh.chooseFile(jsonFile(first), () => /Imported/.test(fresh.statuses().join('\n')))
    expect(storage.data.get(STORAGE_KEY)).toBe(first)
    expect(await exported(fresh)).toBe(first)
    fresh.unmount()

    const reloaded = mount(storage)
    reloaded.selectDisplay()
    expect(reloaded.stored()).toBe('[-71.5, 64, 20]')
    expect(await exported(reloaded)).toBe(first)
  })

  test('an accepted import over a corrupt stored value preserves the corrupt bytes first', async () => {
    const storage = new FakeStorage()
    storage.data.set(STORAGE_KEY, 'corrupt{')
    const page = mount(storage)
    await page.chooseFile(jsonFile(serializeSnapshot(articulatedDeck)), () => /Imported/.test(page.statuses().join('\n')))
    expect(storage.data.get(`${QUARANTINE_PREFIX}0`)).toBe('corrupt{')
    expect(page.alerts().join('\n')).toContain(`${QUARANTINE_PREFIX}0`)
    expect(parseStored(storage)).toEqual(articulatedDeck)
  })

  test('a rejected import over a corrupt stored value does not move the corrupt bytes', async () => {
    const storage = new FakeStorage()
    storage.data.set(STORAGE_KEY, 'corrupt{')
    const page = mount(storage)
    await page.chooseFile(jsonFile('{"schemaVersion":8}'), () => /Import rejected/.test(page.alerts().join('\n')))
    expect(storage.data.get(STORAGE_KEY)).toBe('corrupt{')
    expect(storage.writes).toEqual([])
    expect(page.alerts().join('\n')).toMatch(/could not be loaded/)
  })

  describe('reset to fixture', () => {
    test('needs a second confirming activation; cancel changes nothing and keeps focus on the mounted control', () => {
      const { storage, page } = editedDeck()
      const stored = storage.data.get(STORAGE_KEY)
      const reset = page.button('Reset to fixture')
      act(() => { reset.focus(); reset.click() })
      expect(reset.textContent).toBe('Confirm reset')
      expect(document.activeElement).toBe(reset)
      expect(storage.data.get(STORAGE_KEY)).toBe(stored)
      expect(page.stored()).toBe('[-71.5, 64, 20]')
      page.click(page.button('Cancel'))
      expect(reset.textContent).toBe('Reset to fixture')
      expect(storage.data.get(STORAGE_KEY)).toBe(stored)
    })

    test('restores the fixture, removes the saved value, clears the selection and persists through reload', () => {
      const { storage, page } = editedDeck()
      const reset = page.button('Reset to fixture')
      page.click(reset)
      page.click(reset)
      expect(storage.data.has(STORAGE_KEY)).toBe(false)
      expect(storage.removes).toEqual([STORAGE_KEY])
      expect(page.text()).not.toContain('Unsaved')
      expect(page.host.querySelector('section[aria-label="Selected placement"]')).toBeNull()
      expect(reset.isConnected).toBe(true)
      page.selectDisplay()
      expect(page.stored()).toBe('[-82, 64, 20]')
      expect(page.$('[data-field="modifiedAt"]').textContent).toBe(articulatedDeck.modifiedAt)
      page.unmount()
      const reloaded = mount(storage)
      reloaded.selectDisplay()
      expect(reloaded.stored()).toBe('[-82, 64, 20]')
      expect(storage.writes).toEqual([STORAGE_KEY])
    })

    test('reset does not lose a corrupt stored value', () => {
      const storage = new FakeStorage()
      storage.data.set(STORAGE_KEY, 'corrupt{')
      const page = mount(storage)
      const reset = page.button('Reset to fixture')
      page.click(reset)
      page.click(reset)
      expect(storage.data.get(`${QUARANTINE_PREFIX}0`)).toBe('corrupt{')
      expect(storage.data.has(STORAGE_KEY)).toBe(false)
      expect(page.alerts().join('\n')).toContain(`${QUARANTINE_PREFIX}0`)
    })
  })

  test('the panel shows the design timestamps, updating them only on a real edit', () => {
    const storage = new FakeStorage()
    const page = mount(storage, () => '2026-11-08T23:59:59.000Z')
    expect(page.$('[data-field="createdAt"]').textContent).toBe(articulatedDeck.createdAt)
    expect(page.$('[data-field="modifiedAt"]').textContent).toBe(articulatedDeck.modifiedAt)
    page.pose('CLOSED')
    page.selectDisplay()
    expect(page.$('[data-field="modifiedAt"]').textContent).toBe(articulatedDeck.modifiedAt)
    page.setX('-71.5')
    expect(page.$('[data-field="modifiedAt"]').textContent).toBe('2026-11-08T23:59:59.000Z')
    expect(page.$('[data-field="createdAt"]').textContent).toBe(articulatedDeck.createdAt)
  })
})
