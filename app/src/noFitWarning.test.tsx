import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NO_FIT_WARNING } from './noFitWarning'
import { App } from './App'

describe('persistent no-fit warning', () => {
  test('one exported constant states the required unvalidated scope and non-evidence', () => {
    for (const term of ['fit', 'clearance', 'wiring', 'connector access', 'cooling', 'assembly']) expect(NO_FIT_WARNING.toLowerCase()).toContain(term)
    expect(NO_FIT_WARNING).toMatch(/unvalidated/)
    for (const term of ['On-screen appearance', 'mesh bounds', 'apparent overlap']) expect(NO_FIT_WARNING).toContain(term)
    expect(NO_FIT_WARNING).toMatch(/not evidence/)
  })

  const cases = [
    ['no selection', 'OPEN', null], ['no selection', 'CLOSED', null],
    ['display selected', 'OPEN', 'display'], ['display selected', 'CLOSED', 'display'],
    ['pi selected', 'OPEN', 'pi'], ['pi selected', 'CLOSED', 'pi'],
  ] as const
  test.each(cases)('is rendered with %s in %s and cannot be dismissed', (_, pose, selectedId) => {
    const html = renderToStaticMarkup(<App initialPose={pose} initialSelectedId={selectedId} />)
    const warning = html.match(/<aside[^>]*aria-label="No-fit warning"[^>]*>([\s\S]*?)<\/aside>/)
    expect(warning, html).not.toBeNull()
    expect(warning![1]).toContain(NO_FIT_WARNING)
    expect(warning![1]).not.toMatch(/<button|<input/)
    expect(html.split(NO_FIT_WARNING)).toHaveLength(2)
  })
})

import { Workbench } from './Workbench'
import { applyPlacementEdit, initialDesign } from './designState'
import { articulatedDeck } from './articulatedFixture'
import { EMPTY_REPORT } from './SnapshotPanel'
test('no rendered UI text claims that anything fits, clears or is valid', () => {
  const clock = () => '2026-11-08T12:00:00.000Z'
  const edited = applyPlacementEdit(initialDesign(articulatedDeck), 'display', { position: [1, 2, 3] }, clock)
  const rejected = applyPlacementEdit(edited, 'display', { rotation: [0, 0, 0, 2], attachment: 'base' }, clock)
  expect(rejected.errors.length).toBeGreaterThan(0)
  const noop = () => {}
  for (const design of [initialDesign(articulatedDeck), edited, rejected]) for (const pose of ['OPEN', 'CLOSED'] as const) for (const selectedId of [null, ...articulatedDeck.placements.map(p => p.id)]) {
    const text = renderToStaticMarkup(Workbench({ design, pose, selectedId, onPose: noop, onSelect: noop, onEdit: noop, report: EMPTY_REPORT, onExport: noop, onImportFile: noop, onReset: noop })).replace(/<[^>]+>/g, ' ')
    expect(text).not.toMatch(/\bfits\b|\bclears\b|\b(is|are|looks?)\s+(valid|clear)\b|\bvalidated\s+(fit|clearance)\b|\bfit\s+(ok|confirmed|verified|passes)\b|\bno\s+(collisions?|interference)\b/i)
  }
})
