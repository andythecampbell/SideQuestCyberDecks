/* Issue #6 sandboxed browser QA. Writes evidence/issue-6/browser-qa.json and screenshots.
 *
 * Procedure (exact):
 *   1. npm run dev --workspace app -- --host 127.0.0.1 --port 4173 --strictPort
 *   2. node evidence/issue-6/browser-qa.cjs        (run as the unprivileged QA user; the
 *      Chromium sandbox stays enabled: chromiumSandbox: true, no --no-sandbox flag)
 *
 * Identity: the JSON records the base commit plus a SHA-256 over the exact app/ and catalog/
 * file contents (tracked + untracked, sorted by path) and the porcelain status. It never hashes
 * itself, so it stays valid when committed together with the code it describes.
 */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { chromium } = require(process.env.QA_PLAYWRIGHT || '/root/.hermes-web-ui/desktop-runtime/hermes/0.22.2/linux-x64/python/node/lib/node_modules/@askjo/camofox-browser/node_modules/playwright-core')

const repo = path.resolve(__dirname, '../..')
const out = __dirname
const URL = process.env.QA_URL || 'http://127.0.0.1:4173/'
const browsers = process.env.QA_BROWSER ? [process.env.QA_BROWSER] : [
  '/root/.hermes/tools/chromium-1208/chrome-linux64/chrome',
  '/root/.hermes-web-ui/desktop-runtime/hermes/0.22.2/linux-x64/python/agent-browser/browsers/chrome-149.0.7827.55/chrome',
]
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim()

function identity() {
  const files = git('ls-files', '-co', '--exclude-standard', '--', 'app', 'catalog').split('\n').filter(Boolean).sort()
  const h = crypto.createHash('sha256')
  for (const f of files) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(repo, f))); h.update('\0') }
  return {
    baseCommit: git('rev-parse', 'HEAD'),
    sourceContentSha256: h.digest('hex'),
    sourceFiles: files.length,
    sourceStatusPorcelain: git('status', '--porcelain', '--', 'app', 'catalog').split('\n').filter(Boolean),
    hashRecipe: "sha256 over sorted `git ls-files -co --exclude-standard -- app catalog`, each as path\\0content\\0",
  }
}

const viewports = [
  { name: 'normal', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 },
  // 200% browser zoom of a 1440x1000 window: half the CSS pixels at twice the density.
  { name: 'zoom-200', viewport: { width: 720, height: 500 }, deviceScaleFactor: 2 },
  { name: 'short', viewport: { width: 1280, height: 560 }, deviceScaleFactor: 1 },
]

const result = { status: 'not-run', url: URL, identity: identity(),
  command: 'node evidence/issue-6/browser-qa.cjs', server: 'npm run dev --workspace app -- --host 127.0.0.1 --port 4173 --strictPort',
  user: require('node:os').userInfo().username, attempts: [], runs: [] }

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
      if (hit && hit !== el && !el.contains(hit)) covered.push({ el: el.outerHTML.slice(0, 80), by: hit.outerHTML.slice(0, 80) })
    }
    return { warning: true, scroll: true, visible: wr.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && wr.top >= 0 && wr.bottom <= innerHeight,
      warningRect: [wr.top, wr.bottom], scrollRect: [sr.top, sr.bottom], scrollTop: scroll.scrollTop, overlaps, covered }
  })
}

async function runViewport(browser, vp) {
  const run = { name: vp.name, viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor, checks: [], consoleErrors: [], pageErrors: [], failedLoads: [], screenshots: [] }
  const context = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor })
  const page = await context.newPage()
  page.on('console', m => { if (m.type() === 'error') run.consoleErrors.push({ text: m.text(), location: m.location() }) })
  page.on('pageerror', e => run.pageErrors.push(String(e)))
  page.on('requestfailed', r => run.failedLoads.push({ url: r.url(), failure: r.failure() }))
  page.on('response', r => { if (r.status() >= 400) run.failedLoads.push({ url: r.url(), status: r.status() }) })
  const shot = async name => { const p = path.join(out, name); await page.screenshot({ path: p }); run.screenshots.push(path.relative(repo, p)) }
  const focused = handle => handle.evaluate(el => document.activeElement === el)
  const stored = () => page.locator('[data-field="position"]').textContent()
  const heading = () => page.locator('section[aria-label="Selected placement"] h2').textContent()
  try {
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.locator('canvas').waitFor()
    await page.waitForTimeout(3000)

    // List selection (keyboard).
    const displayItem = page.getByRole('button', { name: 'Hoysond 7" HDMI Touchscreen', exact: true })
    await displayItem.focus(); await page.keyboard.press('Enter')
    assert(run, 'list-select-display', (await heading()) === 'Hoysond 7" HDMI Touchscreen' && (await displayItem.getAttribute('aria-pressed')) === 'true')
    assert(run, 'focus-after-list-select', await focused(await displayItem.elementHandle()))

    let layout = await warningLayout(page)
    assert(run, 'warning-nonoverlap-top', layout.visible && !layout.overlaps?.length && !layout.covered?.length, { layout })

    // Edit from the keyboard: Enter submits; the same input must keep focus.
    const x = await page.locator('input[name="x"]').elementHandle()
    await x.focus(); await x.fill('-71.5'); await page.keyboard.press('Enter')
    assert(run, 'edit-x-enter', (await stored()) === '[-71.5, 64, 20]', { stored: await stored() })
    assert(run, 'focus-kept-after-edit', await x.evaluate(el => el.isConnected && document.activeElement === el))
    const apply = await page.getByRole('button', { name: 'Apply position' }).elementHandle()
    await page.locator('input[name="y"]').fill('51'); await apply.focus(); await page.keyboard.press('Enter')
    assert(run, 'edit-y-apply', (await stored()) === '[-71.5, 51, 20]', { stored: await stored() })
    assert(run, 'focus-kept-on-apply', await focused(apply))
    const zPlus = await page.getByRole('button', { name: 'Rotate + step about lid Z' }).elementHandle()
    const rotBefore = await page.locator('[data-field="rotation"]').textContent()
    await zPlus.focus(); await page.keyboard.press('Space')
    const rotAfter = await page.locator('[data-field="rotation"]').textContent()
    assert(run, 'rotate-z', rotAfter !== rotBefore, { rotBefore, rotAfter })
    assert(run, 'focus-kept-on-rotate', await focused(zPlus))

    // Scrolled to the bottom: the warning still never covers a control (the sticky-overlay bug).
    await page.locator('.panel-scroll').evaluate(el => { el.scrollTop = el.scrollHeight })
    layout = await warningLayout(page)
    assert(run, 'warning-nonoverlap-scrolled', layout.visible && !layout.overlaps?.length && !layout.covered?.length, { layout })
    await page.locator('.panel-scroll').evaluate(el => { el.scrollTop = 0 })
    if (vp.name === 'normal') await shot('open.png')
    else await shot(`${vp.name}-open.png`)

    // Pose toggle (keyboard).
    const closed = page.getByRole('button', { name: 'CLOSED · 210°', exact: true })
    await closed.focus(); await page.keyboard.press('Space')
    await page.waitForTimeout(1000)
    assert(run, 'pose-closed', (await closed.getAttribute('aria-pressed')) === 'true')
    assert(run, 'focus-kept-on-pose', await focused(await closed.elementHandle()))
    assert(run, 'edit-survives-pose', (await stored()) === '[-71.5, 51, 20]' && (await page.locator('[data-field="rotation"]').textContent()) === rotAfter)
    layout = await warningLayout(page)
    assert(run, 'warning-nonoverlap-closed', layout.visible && !layout.overlaps?.length && !layout.covered?.length, { layout })

    // Mesh selection: click a grid over the canvas until a mesh other than the display is picked.
    const box = await page.locator('canvas').boundingBox()
    let picked = null
    outer: for (let fy = 0.2; fy <= 0.85; fy += 0.05) for (let fx = 0.15; fx <= 0.85; fx += 0.05) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
      const h = await page.locator('section[aria-label="Selected placement"] h2').count() ? await heading() : null
      if (h && h !== 'Hoysond 7" HDMI Touchscreen') { picked = { heading: h, at: [fx, fy] }; break outer }
    }
    assert(run, 'mesh-select', !!picked, { picked })
    if (picked) {
      const item = page.getByRole('button', { name: picked.heading, exact: true })
      assert(run, 'mesh-select-syncs-list', (await item.getAttribute('aria-pressed')) === 'true' && (await displayItem.getAttribute('aria-pressed')) === 'false')
    }
    if (vp.name === 'normal') await shot('closed.png')
    else await shot(`${vp.name}-closed.png`)

    // Selection change back via the list (keyboard): edits persist, focus stays on the list item.
    await displayItem.focus(); await page.keyboard.press('Enter')
    assert(run, 'list-reselect-display', (await heading()) === 'Hoysond 7" HDMI Touchscreen' && (await stored()) === '[-71.5, 51, 20]')
    assert(run, 'focus-after-selection-change', await focused(await displayItem.elementHandle()))
    assert(run, 'unsaved-marker', await page.getByText('Unsaved', { exact: false }).isVisible())
    layout = await warningLayout(page)
    assert(run, 'warning-nonoverlap-final', layout.visible && !layout.overlaps?.length && !layout.covered?.length, { layout })

    assert(run, 'no-console-errors', run.consoleErrors.length === 0 && run.pageErrors.length === 0)
    assert(run, 'no-failed-loads', run.failedLoads.length === 0)
  } catch (e) {
    run.failed = true; run.error = String(e && e.stack || e)
  } finally {
    await context.close()
  }
  return run
}

async function main() {
  let browser
  for (const executablePath of browsers) {
    try {
      browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: true, timeout: 30000,
        env: { ...process.env, LD_LIBRARY_PATH: process.env.QA_LD_LIBRARY_PATH || '/root/.hermes/cache/scratch/sidequest-browser-runtime/runtime/usr/lib/x86_64-linux-gnu' } })
      result.attempts.push({ executablePath, launched: true, version: browser.version() })
      break
    } catch (e) { result.attempts.push({ executablePath, launched: false, error: String(e) }) }
  }
  if (!browser) { result.status = 'blocked-before-navigation'; return }
  try {
    // Sequential: this host's Chromium resources are constrained.
    for (const vp of viewports) result.runs.push(await runViewport(browser, vp))
  } finally { await browser.close() }
  result.status = result.runs.every(r => !r.failed) ? 'passed' : 'failed'
}

main().catch(e => { result.status = 'error'; result.error = String(e) }).finally(() => {
  result.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(out, 'browser-qa.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ status: result.status, runs: result.runs.map(r => ({ name: r.name, failed: !!r.failed, failedChecks: r.checks.filter(c => !c.pass).map(c => c.check), error: r.error })) }, null, 2))
  process.exitCode = result.status === 'passed' ? 0 : result.status === 'blocked-before-navigation' ? 2 : 1
})
