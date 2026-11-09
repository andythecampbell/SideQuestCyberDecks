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

import { createBrowserPersistence, STORAGE_KEY, type StorageLike } from './browserPersistence'
import { parseSnapshot } from './domain/snapshot'
import { catalog } from './catalog'
import { SnapshotPanel } from './SnapshotPanel'
import { deck001 } from './fixtures'

const memoryStorage = (initial: Record<string, string> = {}): StorageLike => {
  const data = new Map(Object.entries(initial))
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: key => { data.delete(key) } }
}

test('messages shown by import, reset and storage flows make no fit, clearance or validity claim', () => {
  const FORBIDDEN = /\bfits\b|\bclears\b|\b(is|are|looks?)\s+(valid|clear)\b|\bvalidated\s+(fit|clearance)\b|\bfit\s+(ok|confirmed|verified|passes)\b|\bno\s+(collisions?|interference)\b/i
  const reasons = ['nope', '{"schemaVersion":3}', JSON.stringify({ ...articulatedDeck, units: 'in' }), JSON.stringify({ ...articulatedDeck, pose: 'OPEN' }), JSON.stringify({ ...articulatedDeck, enclosure: { id: 'placeholder-box', revision: 1 } })]
    .flatMap(text => { const result = parseSnapshot(text, catalog); return result.ok ? [] : result.errors })
  expect(reasons.length).toBeGreaterThan(4)
  const migrated = parseSnapshot(JSON.stringify({ ...deck001, extra: 1 }), catalog)
  const notices = migrated.ok ? migrated.notices : []
  expect(notices.length).toBeGreaterThan(0)

  const loaded = createBrowserPersistence(memoryStorage({ [STORAGE_KEY]: 'corrupt{' }), catalog).load()
  const quarantined = createBrowserPersistence(memoryStorage({ [STORAGE_KEY]: 'corrupt{' }), catalog).save(articulatedDeck)
  const failed = createBrowserPersistence({ ...memoryStorage(), setItem: () => { throw new Error('quota') } }, catalog).save(articulatedDeck)
  const report = { storageNotices: [...loaded.notices, ...quarantined.notices, ...failed.notices], importNotices: notices, importErrors: reasons }
  expect(report.storageNotices).toHaveLength(3)

  const text = renderToStaticMarkup(<SnapshotPanel createdAt={articulatedDeck.createdAt} modifiedAt={articulatedDeck.modifiedAt} report={report} onExport={() => {}} onImportFile={() => {}} onReset={() => {}} />).replace(/<[^>]+>/g, ' ')
  expect(text).not.toMatch(FORBIDDEN)
})
