import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { App } from './App'
import { articulatedDeck } from './articulatedFixture'
import { catalog } from './catalog'
import { confidences, estimateFeatures, refKey } from './domain/catalog'
import { formatExact, positionPatch, rotationPatch } from './PlacementPanel'

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const field = (html: string, name: string) => {
  const m = html.match(new RegExp(`data-field="${name}"[^>]*>([\\s\\S]*?)</(?:dd|ul|output)>`))
  expect(m, `${name} missing`).not.toBeNull()
  return decode(m![1].replace(/<[^>]+>/g, '|')).split('|').filter(Boolean)
}

describe('selected placement transparency panel', () => {
  for (const pose of ['OPEN', 'CLOSED'] as const) for (const p of articulatedDeck.placements) {
    test(`${p.id} in ${pose}: values equal the stored configuration and catalog confidence`, () => {
      const html = renderToStaticMarkup(<App initialPose={pose} initialSelectedId={p.id} />)
      const component = catalog.components.get(refKey(p.component))!
      expect(field(html, 'component')).toEqual([refKey(p.component)])
      expect(field(html, 'attachment')).toEqual([p.attachment])
      const [position] = field(html, 'position'), [rotation] = field(html, 'rotation')
      expect(JSON.parse(position)).toEqual(p.position)
      expect(JSON.parse(rotation)).toEqual(p.rotation)
      expect(rotation).toBe(formatExact(p.rotation))
      const estimates = field(html, 'estimates')
      expect(estimates).toEqual(estimateFeatures(component))
      expect(estimates).toHaveLength(confidences(component).filter(c => c === 'estimate').length)
      const enclosure = catalog.enclosures.get(refKey(articulatedDeck.enclosure))!
      expect(enclosure.schemaVersion === 2 && enclosure.calibration).toBe('UNRESOLVED')
      expect(field(html, 'calibration')).toEqual([`${refKey(articulatedDeck.enclosure)} calibration: UNRESOLVED`])
      for (const [axis, v] of p.position.map((v, i) => ['xyz'[i], v] as const)) {
        expect(html).toMatch(new RegExp(`<input[^>]*name="${axis}"[^>]*value="${String(v)}"|<input[^>]*value="${String(v)}"[^>]*name="${axis}"`))
      }
    })
  }

  test('no transparency panel without a selection', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).not.toContain('data-field="position"')
  })

  test('editing controls are native, keyboard-operable inputs and buttons; attachment is not editable', () => {
    const html = renderToStaticMarkup(<App initialSelectedId="display" />)
    expect(html.match(/<input[^>]*type="number"/g)?.length).toBeGreaterThanOrEqual(4)
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Apply position<\/button>/)
    for (const axis of ['X', 'Y', 'Z']) for (const sign of ['−', '+']) expect(html).toContain(`aria-label="Rotate ${sign} step about lid ${axis}"`)
    expect(html).not.toMatch(/<(select|input)[^>]*name="attachment"/)
  })
})

describe('exact formatting and patch construction', () => {
  test('formatExact round-trips every stored number, including signed zero', () => {
    const q: [number, number, number, number] = [-0, 0.7071067811865476, 1e-17, -0.7071067811865475]
    expect(formatExact(q)).toBe('[-0, 0.7071067811865476, 1e-17, -0.7071067811865475]')
    expect(Object.is(JSON.parse(formatExact(q))[0], -0)).toBe(true)
  })
  test('positionPatch keeps blank or non-numeric fields non-finite so the domain rejects them', () => {
    expect(positionPatch({ x: '1.5', y: '-2', z: '0' })).toEqual({ position: [1.5, -2, 0] })
    expect(positionPatch({ x: '', y: '0', z: '0' }).position[0]).toBeNaN()
    expect(positionPatch({ x: 'abc', y: '0', z: '0' }).position[0]).toBeNaN()
  })
  test('rotationPatch rotates the stored quaternion about a body axis by the step', () => {
    expect(rotationPatch([0, 0, 0, 1], 'x', 1, '90')!.rotation.map(v => +v.toFixed(12))).toEqual([+Math.SQRT1_2.toFixed(12), 0, 0, +Math.SQRT1_2.toFixed(12)])
    expect(rotationPatch([0, 0, 0, 1], 'x', -1, '90')!.rotation[0]).toBeCloseTo(-Math.SQRT1_2, 12)
    expect(rotationPatch([0, 0, 0, 1], 'x', 1, '')).toBeNull()
  })
})
