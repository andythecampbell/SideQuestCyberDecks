// @vitest-environment jsdom
// Mounted interaction test: real React DOM, real App state, real list/panel/pose controls.
// jsdom has no WebGL, so the Viewport is replaced by a stand-in that exposes one "mesh" button per
// placement and calls the same onSelect prop the real meshes receive. Real mesh picking is covered
// by the sandboxed browser QA (evidence/issue-6/browser-qa.cjs).
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Viewport as RealViewport } from './scene/Viewport'

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

const act = (fn: () => void) => flushSync(fn)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<App />))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const $ = <T extends Element = HTMLElement>(sel: string) => {
  const el = host.querySelector<T>(sel)
  expect(el, sel).not.toBeNull()
  return el!
}
const byText = (text: string) => {
  const el = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === text)
  expect(el, text).toBeDefined()
  return el!
}
const listButton = (name: string) => byText(name)
const mesh = (id: string) => $<HTMLButtonElement>(`[data-mesh="${id}"]`)
const stored = (f: 'position' | 'rotation') => $(`[data-field="${f}"]`).textContent
const heading = () => $('section[aria-label="Selected placement"] h2').textContent
const input = (axis: 'x' | 'y' | 'z') => $<HTMLInputElement>(`input[name="${axis}"]`)
const warning = () => host.querySelector('[aria-label="No-fit warning"]')

/** Types like a user: React's controlled inputs listen for `input` events on the native value. */
function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    el.focus()
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = (el: HTMLElement) => act(() => { el.focus(); el.click() })

describe('mounted list/mesh selection -> edit -> pose -> selection change', () => {
  test('keeps keyboard focus and the warning through the whole flow', () => {
    expect(warning()).not.toBeNull()

    // List selection.
    const displayItem = listButton('Hosyond 7" HDMI Touchscreen')
    click(displayItem)
    expect(heading()).toBe('Hosyond 7" HDMI Touchscreen')
    expect(displayItem.getAttribute('aria-pressed')).toBe('true')
    expect(mesh('display').dataset.selected).toBe('true')
    expect(document.activeElement).toBe(displayItem)

    // Edit position from the keyboard: focus stays on the same, still-mounted input.
    const x = input('x')
    type(x, '-71.5')
    act(() => x.form!.requestSubmit())
    expect(stored('position')).toBe('[-71.5, 64, 20]')
    expect(x.isConnected).toBe(true)
    expect(input('x')).toBe(x)
    expect(document.activeElement).toBe(x)
    expect(x.value).toBe('-71.5')

    // Apply with the button: the button keeps focus after the accepted edit.
    const apply = byText('Apply position')
    type(input('y'), '51')
    click(apply)
    expect(stored('position')).toBe('[-71.5, 51, 20]')
    expect(apply.isConnected).toBe(true)
    expect(document.activeElement).toBe(apply)

    // Rejected edit keeps the draft and focus; stored value unchanged.
    type(input('z'), '')
    click(apply)
    expect(stored('position')).toBe('[-71.5, 51, 20]')
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/Edit rejected/)
    expect(input('z').value).toBe('')
    expect(document.activeElement).toBe(apply)
    type(input('z'), '20')

    // Rotation keeps focus on the rotate button.
    const zPlus = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.getAttribute('aria-label')?.startsWith('Rotate + step about') && button.getAttribute('aria-label')?.endsWith(' Z'))!
    expect(zPlus).toBeDefined()
    const before = stored('rotation')
    click(zPlus)
    expect(stored('rotation')).not.toBe(before)
    expect(document.activeElement).toBe(zPlus)

    // Pose toggle: inspection state only; stored values, drafts and warning are unchanged.
    const closed = byText('CLOSED · 210°')
    const rotated = stored('rotation')
    click(closed)
    expect(closed.getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(closed)
    expect(stored('position')).toBe('[-71.5, 51, 20]')
    expect(stored('rotation')).toBe(rotated)
    expect(input('x')).toBe(x)
    expect(warning()).not.toBeNull()

    // Mesh selection changes the panel and the list highlight.
    click(mesh('pi'))
    expect(heading()).toBe('Raspberry Pi 5')
    expect(listButton('Raspberry Pi 5').getAttribute('aria-pressed')).toBe('true')
    expect(displayItem.getAttribute('aria-pressed')).toBe('false')
    expect(stored('position')).toBe('[-140, 20, -80]')
    expect(input('x').value).toBe('-140')
    expect(document.activeElement).toBe(mesh('pi'))

    // List selection change back: the edited display values persist; focus stays on the list item.
    click(displayItem)
    expect(heading()).toBe('Hosyond 7" HDMI Touchscreen')
    expect(stored('position')).toBe('[-71.5, 51, 20]')
    expect(stored('rotation')).toBe(rotated)
    expect(input('x').value).toBe('-71.5')
    expect(document.activeElement).toBe(displayItem)
    expect(byText('CLOSED · 210°').getAttribute('aria-pressed')).toBe('true')
    expect(warning()).not.toBeNull()
  })
})
