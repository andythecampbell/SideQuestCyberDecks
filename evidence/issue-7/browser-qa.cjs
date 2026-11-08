/* Issue #7 sandboxed browser QA. Writes evidence/issue-7/browser-qa.json and screenshots.
 *
 * Procedure (exact), from the repository root, as root:
 *   bash evidence/issue-7/run-browser-qa.sh
 * The runner starts `env -u NODE_ENV npm run dev --workspace app -- --host 127.0.0.1 --port 4173 --strictPort`,
 * then runs this file as the unprivileged QA user with the Chromium sandbox enabled
 * (chromiumSandbox: true, no --no-sandbox flag), and stops the server afterwards.
 *
 * Identity: QA_IDENTITY is a JSON file written by the runner with the base commit, a SHA-256 over
 * the exact app/, catalog/ and snapshots/ contents served, and the porcelain status.
 *
 * What is checked, per viewport, in one browser context:
 *   edit -> reload, exactly-once persistence, no writes on load/pose/selection, canonical stored
 *   bytes; export -> clear storage -> import byte-identical; corrupt and invalid files rejected with
 *   a readable reason and no change; v1 migration notice; corrupt stored value quarantined and never
 *   overwritten with fixture fallback and notice; reset to fixture; no fit claims; the persistent
 *   no-fit warning never covers a control at normal, 200%-equivalent and short viewports.
 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.QA_PLAYWRIGHT || '/root/.hermes-web-ui/desktop-runtime/hermes/0.22.2/linux-x64/python/node/lib/node_modules/@askjo/camofox-browser/node_modules/playwright-core')

const out = process.env.QA_OUT || __dirname
const work = process.env.QA_WORK || path.join(out, 'work')
const fixtures = process.env.QA_FIXTURES
const URL = process.env.QA_URL || 'http://127.0.0.1:4173/'
const browsers = process.env.QA_BROWSER ? [process.env.QA_BROWSER] : [
  '/root/.hermes-web-ui/desktop-runtime/hermes/0.22.2/linux-x64/python/agent-browser/browsers/chrome-149.0.7827.55/chrome',
  '/root/.hermes/tools/chromium-1208/chrome-linux64/chrome',
]
const identity = JSON.parse(fs.readFileSync(process.env.QA_IDENTITY, 'utf8'))

const STORAGE_KEY = 'sidequest-decks:configuration'
const QUARANTINE_0 = `${STORAGE_KEY}:quarantine:0`
const DISPLAY = 'Hoysond 7" HDMI Touchscreen'
const FIXTURE_DISPLAY = '[-82, 64, 20]'
const EDITED_DISPLAY = '[-71.5, 51, 20]'
const FIXTURE_STAMP = '2026-10-07T00:00:00.000Z'
const FORBIDDEN = /\bfits\b|\bclears\b|\b(is|are|looks?)\s+(valid|clear)\b|\bvalidated\s+(fit|clearance)\b|\bfit\s+(ok|confirmed|verified|passes)\b|\bno\s+(collisions?|interference)\b/i

const allViewports = [
  { name: 'normal', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 },
  // 200% browser zoom of a 1440x1000 window: half the CSS pixels at twice the density.
  { name: 'zoom-200', viewport: { width: 720, height: 500 }, deviceScaleFactor: 2 },
  { name: 'short', viewport: { width: 1280, height: 560 }, deviceScaleFactor: 1 },
]
const viewports = process.env.QA_VIEWPORT ? allViewports.filter(v => v.name === process.env.QA_VIEWPORT) : allViewports
if (!viewports.length) throw new Error(`Unknown QA_VIEWPORT: ${process.env.QA_VIEWPORT}`)
const resultFile = process.env.QA_RESULT_FILE || 'browser-qa.json'

const result = {
  status: 'not-run', url: URL, identity, command: 'bash evidence/issue-7/run-browser-qa.sh',
  server: `env -u NODE_ENV npm run dev --workspace app -- --host 127.0.0.1 --port ${new globalThis.URL(URL).port || '80'} --strictPort`,
  user: require('node:os').userInfo().username, chromiumSandbox: true, attempts: [], runs: [],
}

const assert = (run, check, pass, detail = {}) => { run.checks.push({ check, pass: !!pass, ...detail }); if (!pass) run.failed = true }

/** Every visible control in the scroll region is unobstructed by the warning, at the current scroll. */
async function warningLayout(page) {
  return page.evaluate(() => {
    const w = document.querySelector('[aria-label="No-fit warning"]')
    const scroll = document.querySelector('.panel-scroll')
    if (!w || !scroll) return { warning: !!w, scroll: !!scroll }
    const wr = w.getBoundingClientRect(), sr = scroll.getBoundingClientRect()
    const style = getComputedStyle(w)
    const overlaps = [], covered = []
    for (const el of scroll.querySelectorAll('button, input')) {
      const r = el.getBoundingClientRect()
      const top = Math.max(r.top, sr.top), bottom = Math.min(r.bottom, sr.bottom)
      if (bottom <= top) continue // scrolled out of view
      if (top < wr.bottom && bottom > wr.top && r.left < wr.right && r.right > wr.left) overlaps.push(el.outerHTML.slice(0, 80))
      const hit = document.elementFromPoint((r.left + r.right) / 2, (top + bottom) / 2)
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) covered.push({ el: el.outerHTML.slice(0, 80), by: hit.outerHTML.slice(0, 80) })
    }
    return { warning: true, scroll: true, visible: wr.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && wr.top >= 0 && wr.bottom <= innerHeight,
      warningRect: [wr.top, wr.bottom], scrollRect: [sr.top, sr.bottom], scrollTop: scroll.scrollTop, overlaps, covered }
  })
}
const layoutOk = l => l.visible && !l.overlaps?.length && !l.covered?.length

async function runViewport(browser, vp) {
  const run = { name: vp.name, viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor, checks: [], consoleErrors: [], pageErrors: [], failedLoads: [], screenshots: [] }
  const context = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor, acceptDownloads: true })
  await context.addInitScript(() => {
    const log = window.__qaStorageLog = { writes: [], removes: [] }
    const original = { set: Storage.prototype.setItem, remove: Storage.prototype.removeItem, clear: Storage.prototype.clear }
    Storage.prototype.setItem = function (key, value) { log.writes.push(key); return original.set.call(this, key, value) }
    Storage.prototype.removeItem = function (key) {
      if (window.__qaFailRemove && key === 'sidequest-decks:configuration') throw new Error('simulated removal denial')
      log.removes.push(key)
      return original.remove.call(this, key)
    }
    Storage.prototype.clear = function () { log.removes.push('*clear*'); return original.clear.call(this) }
  })
  const page = await context.newPage()
  page.on('console', m => { if (m.type() === 'error') run.consoleErrors.push({ text: m.text(), location: m.location() }) })
  page.on('pageerror', e => run.pageErrors.push(String(e)))
  page.on('requestfailed', r => run.failedLoads.push({ url: r.url(), failure: r.failure() }))
  page.on('response', r => { if (r.status() >= 400) run.failedLoads.push({ url: r.url(), status: r.status() }) })

  const check = (name, pass, detail) => assert(run, name, pass, detail)
  const shot = async name => { const p = path.join(out, name); await page.screenshot({ path: p }); run.screenshots.push(`evidence/issue-7/${name}`) }
  const settle = async () => { await page.locator('canvas').waitFor(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200) }
  const goto = async () => { await page.goto(URL, { waitUntil: 'networkidle' }); await settle() }
  const reload = async () => { await page.reload({ waitUntil: 'networkidle' }); await settle() }
  const stored = () => page.locator('[data-field="position"]').textContent()
  const stamp = field => page.locator(`[data-field="${field}"]`).textContent()
  const value = (key = STORAGE_KEY) => page.evaluate(k => localStorage.getItem(k), key)
  const log = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__qaStorageLog)))
  const resetLog = () => page.evaluate(() => { window.__qaStorageLog.writes.length = 0; window.__qaStorageLog.removes.length = 0 })
  const unsavedVisible = () => page.getByText('Unsaved', { exact: false }).count()
  const alerts = async () => (await page.locator('[role="alert"]').allTextContents()).join('\n')
  const statuses = async () => (await page.locator('[role="status"]').allTextContents()).join('\n')
  const hasSelection = () => page.locator('section[aria-label="Selected placement"]').count()
  const displayItem = page.getByRole('button', { name: DISPLAY, exact: true })
  const selectDisplay = async () => {
    await displayItem.focus(); await page.keyboard.press('Enter')
    await page.locator('section[aria-label="Selected placement"] h2').waitFor()
  }
  const poseButton = p => page.getByRole('button', { name: p === 'OPEN' ? 'OPEN · 120°' : 'CLOSED · 210°', exact: true })
  const setPose = async p => { await poseButton(p).focus(); await page.keyboard.press('Space') }
  const exportFile = async label => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export file', exact: true }).click()])
    const file = path.join(work, `${vp.name}-${label}.json`)
    await download.saveAs(file)
    return { suggested: download.suggestedFilename(), text: fs.readFileSync(file, 'utf8'), file }
  }
  const picker = () => page.locator('input[type="file"]')
  const writeWorkFile = (label, text) => { const file = path.join(work, `${vp.name}-${label}.json`); fs.writeFileSync(file, text); return file }
  const waitAlert = pattern => page.waitForFunction(p => [...document.querySelectorAll('[role="alert"]')].some(a => new RegExp(p).test(a.textContent)), pattern.source, { timeout: 10000 })
  const waitStatus = pattern => page.waitForFunction(p => [...document.querySelectorAll('[role="status"]')].some(a => new RegExp(p).test(a.textContent)), pattern.source, { timeout: 10000 })

  try {
    // ---------- Initial load: reads only, fixture shown, nothing marked unsaved.
    await goto()
    let l = await log()
    check('load-writes-nothing', l.writes.length === 0 && l.removes.length === 0, l)
    check('load-no-stored-value', (await value()) === null)
    check('load-fixture-timestamps', (await stamp('createdAt')) === FIXTURE_STAMP && (await stamp('modifiedAt')) === FIXTURE_STAMP)
    check('load-not-marked-unsaved', (await unsavedVisible()) === 0)
    check('load-header-names-enclosure', await page.getByText('2800 provisional articulated preview', { exact: false }).isVisible())

    // ---------- Edit -> exactly one write of canonical bytes, stamps modifiedAt once.
    await selectDisplay()
    check('select-shows-fixture-values', (await stored()) === FIXTURE_DISPLAY, { stored: await stored() })
    await page.locator('input[name="x"]').fill('-71.5')
    await page.keyboard.press('Enter')
    check('edit-applies', (await stored()) === '[-71.5, 64, 20]', { stored: await stored() })
    l = await log()
    check('edit-one-write', JSON.stringify(l.writes) === JSON.stringify([STORAGE_KEY]) && l.removes.length === 0, l)
    const afterFirst = await value()
    const firstParsed = JSON.parse(afterFirst)
    check('edit-stored-canonical-shape', afterFirst.endsWith('\n') && Object.keys(firstParsed)[0] === 'base' && firstParsed.placements.find(p => p.id === 'display').position.join() === '-71.5,64,20')
    check('edit-stamps-modifiedAt', firstParsed.modifiedAt !== FIXTURE_STAMP && (await stamp('modifiedAt')) === firstParsed.modifiedAt, { modifiedAt: firstParsed.modifiedAt })
    check('edit-keeps-createdAt', firstParsed.createdAt === FIXTURE_STAMP && (await stamp('createdAt')) === FIXTURE_STAMP)
    check('edit-not-marked-unsaved', (await unsavedVisible()) === 0)

    await page.waitForTimeout(5) // Guarantees a later wall-clock millisecond for the second edit.
    await page.locator('input[name="y"]').fill('51')
    await page.getByRole('button', { name: 'Apply position', exact: true }).click()
    check('second-edit-applies', (await stored()) === EDITED_DISPLAY, { stored: await stored() })
    l = await log()
    check('second-edit-second-write', l.writes.length === 2, l)
    const edited = await value()
    check('second-edit-advances-modifiedAt', JSON.parse(edited).modifiedAt !== firstParsed.modifiedAt, { first: firstParsed.modifiedAt, second: JSON.parse(edited).modifiedAt })

    // ---------- A rejected edit writes nothing and keeps the stored value.
    await resetLog()
    const before = await value()
    await page.locator('input[name="z"]').fill('')
    await page.getByRole('button', { name: 'Apply position', exact: true }).click()
    check('rejected-edit-alerted', /Edit rejected; configuration unchanged/.test(await alerts()))
    l = await log()
    check('rejected-edit-writes-nothing', l.writes.length === 0 && l.removes.length === 0 && (await value()) === before, l)
    await page.locator('input[name="z"]').fill('20')

    // ---------- Exclusions: pose and selection changes write nothing and never stamp.
    await resetLog()
    const stampBefore = await stamp('modifiedAt')
    for (const p of ['CLOSED', 'OPEN', 'CLOSED']) { await setPose(p); await page.waitForTimeout(300) }
    await page.getByRole('button', { name: 'Raspberry Pi 5', exact: true }).click()
    await selectDisplay()
    const box = await page.locator('canvas').boundingBox()
    let picked = null
    outer: for (let fy = 0.2; fy <= 0.85; fy += 0.05) for (let fx = 0.15; fx <= 0.85; fx += 0.05) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
      const h = (await page.locator('section[aria-label="Selected placement"] h2').count()) ? await page.locator('section[aria-label="Selected placement"] h2').textContent() : null
      if (h !== DISPLAY) { picked = { heading: h, at: [fx, fy] }; break outer }
    }
    check('exclusions-selection-changed-by-mesh', !!picked, { picked })
    await setPose('CLOSED')
    l = await log()
    check('exclusions-write-nothing', l.writes.length === 0 && l.removes.length === 0, l)
    check('exclusions-stored-unchanged', (await value()) === edited)
    check('exclusions-no-stamp', (await stamp('modifiedAt')) === stampBefore)
    check('exclusions-no-view-state-in-stored', !/"pose"|"selectedId"|"OPEN"|"CLOSED"/.test(edited))
    await selectDisplay()
    await shot(`${vp.name}-edited.png`)

    // ---------- Reload: restores the edit, resets view state, writes nothing.
    await reload()
    l = await log()
    check('reload-writes-nothing', l.writes.length === 0 && l.removes.length === 0, l)
    check('reload-pose-not-restored', (await poseButton('OPEN').getAttribute('aria-pressed')) === 'true')
    check('reload-selection-not-restored', (await hasSelection()) === 0)
    await selectDisplay()
    check('reload-restores-edit', (await stored()) === EDITED_DISPLAY, { stored: await stored() })
    check('reload-restores-timestamps', (await stamp('modifiedAt')) === JSON.parse(edited).modifiedAt && (await stamp('createdAt')) === FIXTURE_STAMP)
    check('reload-stored-untouched', (await value()) === edited)

    let layout = await warningLayout(page)
    check('warning-nonoverlap-after-reload', layoutOk(layout), { layout })

    // ---------- Export -> clear storage -> import is byte-identical.
    const e1 = await exportFile('export-1')
    check('export-file-name', e1.suggested === 'sidequest-configuration.json', { suggested: e1.suggested })
    check('export-equals-stored-bytes', e1.text === edited)
    await page.evaluate(() => localStorage.clear())
    await reload()
    l = await log()
    check('cleared-reload-writes-nothing', l.writes.length === 0 && l.removes.length === 0, l)
    check('cleared-storage-empty', (await value()) === null)
    await selectDisplay()
    check('cleared-shows-fixture', (await stored()) === FIXTURE_DISPLAY && (await stamp('modifiedAt')) === FIXTURE_STAMP, { stored: await stored() })

    await resetLog()
    await picker().setInputFiles(e1.file)
    await waitStatus(/Imported/)
    l = await log()
    check('import-one-write', JSON.stringify(l.writes) === JSON.stringify([STORAGE_KEY]) && l.removes.length === 0, l)
    check('import-stored-byte-identical', (await value()) === e1.text)
    check('import-clears-selection', (await hasSelection()) === 0)
    await selectDisplay()
    const fileJson = JSON.parse(e1.text)
    check('import-restores-state', (await stored()) === EDITED_DISPLAY, { stored: await stored() })
    check('import-preserves-timestamps', (await stamp('createdAt')) === fileJson.createdAt && (await stamp('modifiedAt')) === fileJson.modifiedAt, { createdAt: await stamp('createdAt'), modifiedAt: await stamp('modifiedAt') })
    const e2 = await exportFile('export-2')
    check('round-trip-byte-identical', e2.text === e1.text)
    await reload()
    await selectDisplay()
    check('import-survives-reload', (await stored()) === EDITED_DISPLAY && (await value()) === e1.text)
    const e3 = await exportFile('export-3')
    check('reload-export-byte-identical', e3.text === e1.text)

    // ---------- Invalid and hand-corrupted files: specific, readable, no change at all.
    const doc = () => JSON.parse(e1.text)
    const bad = [
      ['hand-corrupted-truncated', e1.text.slice(0, 40), /not valid JSON/],
      ['non-json', 'this file is not json', /not valid JSON/],
      ['oversized', ' '.repeat(1048577), /too large/],
      ['unknown-version', JSON.stringify({ ...doc(), schemaVersion: 3 }), /Unsupported schemaVersion 3.*Supported versions: 1, 2/],
      ['missing-version', JSON.stringify({ ...doc(), schemaVersion: undefined }), /Missing schemaVersion.*Supported versions: 1, 2/],
      ['wrong-units', JSON.stringify({ ...doc(), units: 'in' }), /units: "in" is not supported/],
      ['non-unit-quaternion', JSON.stringify({ ...doc(), base: { position: [0, 0, 0], rotation: [0, 0, 0, 2] } }), /base\.rotation: rotation must be a unit quaternion/],
      ['unknown-key', JSON.stringify({ ...doc(), pose: 'OPEN' }), /Unknown key: pose/],
      ['duplicate-ids', JSON.stringify({ ...doc(), placements: [doc().placements[0], doc().placements[0]] }), /duplicate placement id: "keyboard"/],
      ['missing-revision', JSON.stringify({ ...doc(), enclosure: { id: 'case-2800-preview', revision: 9 } }), /case-2800-preview@9 is not in the catalog/],
      ['lid-on-box', JSON.stringify({ ...doc(), enclosure: { id: 'placeholder-box', revision: 1 } }), /Box enclosure placeholder-box@1 has no lid/],
    ]
    await selectDisplay()
    for (const [label, text, reason] of bad) {
      await resetLog()
      const bytes = await value()
      const shown = await stored()
      await picker().setInputFiles(writeWorkFile(label, text))
      await waitAlert(new RegExp(reason.source))
      const message = await alerts()
      const after = await log()
      check(`reject-${label}-message`, /Import rejected; configuration unchanged/.test(message) && reason.test(message), { message: message.slice(0, 400) })
      check(`reject-${label}-no-change`, after.writes.length === 0 && after.removes.length === 0 && (await value()) === bytes && (await stored()) === shown)
    }
    await shot(`${vp.name}-rejected-import.png`)
    layout = await warningLayout(page)
    check('warning-nonoverlap-with-import-error', layoutOk(layout), { layout })
    await page.locator('.panel-scroll').evaluate(el => { el.scrollTop = el.scrollHeight })
    layout = await warningLayout(page)
    check('warning-nonoverlap-with-import-error-scrolled', layoutOk(layout), { layout })
    await page.locator('.panel-scroll').evaluate(el => { el.scrollTop = 0 })

    // ---------- v1 migration is visible and names dropped keys; the file's timestamps are kept.
    await resetLog()
    await picker().setInputFiles(path.join(fixtures, 'snapshot-v1-extra-keys.frozen.json'))
    await waitStatus(/Migrated from schema version 1 to 2/)
    const migration = await statuses()
    check('v1-notice-names-dropped-keys', /Dropped keys not in schema version 1: /.test(migration) && ['notes', 'enclosure.sku', 'placements[1].label', 'placements[0].component.vendor'].every(k => migration.includes(k)), { migration })
    l = await log()
    check('v1-import-one-write', JSON.stringify(l.writes) === JSON.stringify([STORAGE_KEY]), l)
    const v1Stored = JSON.parse(await value())
    check('v1-stored-as-v2', v1Stored.schemaVersion === 2 && v1Stored.enclosure.id === 'placeholder-box' && v1Stored.placements.every(p => p.attachment === 'base'))
    check('v1-preserves-timestamps', v1Stored.createdAt === FIXTURE_STAMP && v1Stored.modifiedAt === FIXTURE_STAMP && (await stamp('modifiedAt')) === FIXTURE_STAMP)
    check('v1-header-names-box', await page.getByText('Placeholder open box', { exact: false }).isVisible())

    // ---------- A corrupt stored value: never overwritten; fixture fallback with a notice.
    const CORRUPT = '{"schemaVersion":2,"units":"mm","placements":['
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, CORRUPT])
    await reload()
    l = await log()
    check('corrupt-load-writes-nothing', l.writes.length === 0 && l.removes.length === 0, l)
    check('corrupt-value-untouched', (await value()) === CORRUPT)
    const corruptNotice = await alerts()
    check('corrupt-notice-visible', /could not be loaded/.test(corruptNotice) && /fixture/.test(corruptNotice) && corruptNotice.includes(STORAGE_KEY), { corruptNotice })
    await selectDisplay()
    check('corrupt-fixture-shown', (await stored()) === FIXTURE_DISPLAY, { stored: await stored() })
    await setPose('CLOSED'); await setPose('OPEN')
    await page.getByRole('button', { name: 'Raspberry Pi 5', exact: true }).click()
    await selectDisplay()
    check('corrupt-value-survives-viewing', (await value()) === CORRUPT && (await log()).writes.length === 0)
    if (vp.name === 'normal') await shot('normal-corrupt-storage.png')
    await reload()
    check('corrupt-persists-across-reload', (await value()) === CORRUPT && /could not be loaded/.test(await alerts()))

    await selectDisplay()
    await resetLog()
    await page.locator('input[name="x"]').fill('-60')
    await page.keyboard.press('Enter')
    l = await log()
    check('corrupt-quarantined-before-write', JSON.stringify(l.writes) === JSON.stringify([QUARANTINE_0, STORAGE_KEY]), l)
    check('corrupt-bytes-preserved', (await value(QUARANTINE_0)) === CORRUPT)
    const restored = JSON.parse(await value())
    check('corrupt-primary-replaced-by-edit', restored.placements.find(p => p.id === 'display').position.join() === '-60,64,20')
    check('corrupt-quarantine-notice', (await alerts()).includes(QUARANTINE_0))

    // ---------- Failed reset: current design and selection stay visible with an explicit reload warning.
    await page.evaluate(() => { window.__qaFailRemove = true })
    await selectDisplay()
    await resetLog()
    let resetButton = page.getByRole('button', { name: 'Reset to fixture', exact: true })
    await resetButton.click()
    let confirm = page.getByRole('button', { name: 'Confirm reset', exact: true })
    await confirm.click()
    l = await log()
    check('reset-removal-failure-keeps-value', (await value()) !== null && l.removes.length === 0, l)
    check('reset-removal-failure-keeps-design', (await stored()) === '[-60, 64, 20]' && (await hasSelection()) === 1, { stored: await stored() })
    const resetFailureNotice = await alerts()
    check('reset-removal-failure-warns-reload', /Reset was not applied/.test(resetFailureNotice) && /reloading can restore it/.test(resetFailureNotice), { resetFailureNotice })
    await page.evaluate(() => { window.__qaFailRemove = false })

    // ---------- Reset to fixture: confirmation, removal, reload shows the fixture; quarantine stays.
    resetButton = page.getByRole('button', { name: 'Reset to fixture', exact: true })
    await resetButton.click()
    confirm = page.getByRole('button', { name: 'Confirm reset', exact: true })
    check('reset-needs-confirmation', await confirm.isVisible() && (await value()) !== null)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    check('reset-cancel-keeps-design', JSON.parse(await value()).modifiedAt === restored.modifiedAt && (await resetButton.isVisible()))
    await resetLog()
    await resetButton.click()
    await confirm.click()
    l = await log()
    check('reset-removes-value', JSON.stringify(l.removes) === JSON.stringify([STORAGE_KEY]) && (await value()) === null, l)
    check('reset-clears-selection', (await hasSelection()) === 0)
    check('reset-quarantine-kept', (await value(QUARANTINE_0)) === CORRUPT)
    await selectDisplay()
    check('reset-shows-fixture', (await stored()) === FIXTURE_DISPLAY && (await stamp('modifiedAt')) === FIXTURE_STAMP, { stored: await stored() })
    if (vp.name === 'normal') await shot('normal-reset.png')
    await reload()
    await selectDisplay()
    check('reset-survives-reload', (await stored()) === FIXTURE_DISPLAY && (await value()) === null && !/could not be loaded/.test(await alerts()))
    check('reset-export-equals-fixture-snapshot', (await exportFile('after-reset')).text === fs.readFileSync(path.join(fixtures, 'snapshot-v2.frozen.json'), 'utf8'))

    // ---------- No fit claims in any state rendered here; warning stays; overlays clean.
    const panelText = await page.locator('.panel').innerText()
    check('no-fit-claims-in-panel', !FORBIDDEN.test(panelText), { sample: panelText.slice(0, 200) })
    layout = await warningLayout(page)
    check('warning-nonoverlap-final', layoutOk(layout), { layout })
    check('no-console-errors', run.consoleErrors.length === 0 && run.pageErrors.length === 0, { consoleErrors: run.consoleErrors, pageErrors: run.pageErrors })
    check('no-failed-loads', run.failedLoads.length === 0, { failedLoads: run.failedLoads })
  } catch (e) {
    run.failed = true; run.error = String(e && e.stack || e)
  } finally {
    await context.close()
  }
  return run
}

async function main() {
  fs.mkdirSync(work, { recursive: true })
  fs.mkdirSync(out, { recursive: true })
  let browser
  for (const executablePath of browsers) {
    try {
      browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: true, timeout: 30000 })
      result.attempts.push({ executablePath, launched: true, version: browser.version() })
      break
    } catch (e) { result.attempts.push({ executablePath, launched: false, error: String(e).slice(0, 400) }) }
  }
  if (!browser) { result.status = 'blocked-before-navigation'; return }
  try {
    // Sequential: this host's Chromium resources are constrained.
    for (const vp of viewports) result.runs.push(await runViewport(browser, vp))
  } finally { await browser.close() }
  result.status = result.runs.every(r => !r.failed) ? 'passed' : 'failed'
}

main().catch(e => { result.status = 'error'; result.error = String(e && e.stack || e) }).finally(() => {
  result.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(out, resultFile), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ status: result.status, error: result.error, runs: result.runs.map(r => ({ name: r.name, failed: !!r.failed, checks: r.checks.length, failedChecks: r.checks.filter(c => !c.pass).map(c => c.check), error: r.error })) }, null, 2))
  process.exitCode = result.status === 'passed' ? 0 : result.status === 'blocked-before-navigation' ? 2 : 1
})
