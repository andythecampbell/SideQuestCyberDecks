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
import { parseSnapshot, serializeSnapshot } from './domain/snapshot'

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
    text: () => host.textContent ?? '',
  }
}

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
