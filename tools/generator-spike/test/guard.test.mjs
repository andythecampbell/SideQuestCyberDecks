import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkRequest } from '../src/guard.mjs'
import { GeneratorError } from '../src/errors.mjs'

const fixture = () =>
  JSON.parse(readFileSync(new URL('../fixtures/synthetic-plate.non-fabrication.request.json', import.meta.url), 'utf8'))

const RECORD = 'evidence/measurements/spike-widget-width-2026-01-02.md'
const COUPON = 'evidence/coupons/spike-coupon.md'

let repoRoot

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'generator-spike-guard-'))
  mkdirSync(join(repoRoot, 'evidence/measurements'), { recursive: true })
  mkdirSync(join(repoRoot, 'evidence/coupons'), { recursive: true })
  writeFileSync(join(repoRoot, RECORD), '# spike record\n')
  writeFileSync(join(repoRoot, COUPON), '# coupon\n')
})

afterEach(() => rmSync(repoRoot, { recursive: true, force: true }))

const measured = (value) => ({
  class: 'physical-fact',
  value,
  confidence: 'measured',
  source: { kind: 'measurement-record', record: RECORD },
})
const datasheet = (value) => ({
  class: 'physical-fact',
  value,
  confidence: 'datasheet',
  source: { kind: 'datasheet', title: 'Widget mechanical drawing', locator: 'rev C, p. 4, fig. 2', uri: 'https://example.com/widget.pdf' },
})
const chosen = (value) => ({
  class: 'design-parameter',
  value,
  author: 'Andy',
  rationale: 'Chosen for the spike.',
  testEvidence: { status: 'not-applicable', reason: 'No coupon applies to this parameter yet.' },
})

/** A fully qualifying fabrication request: everything measured, one datasheet, one design parameter. */
const qualifying = () => {
  const request = fixture()
  request.purpose = 'fabrication'
  for (const [name, input] of Object.entries(request.inputs)) request.inputs[name] = measured(input.value)
  request.inputs.plateSizeY = datasheet(request.inputs.plateSizeY.value)
  request.inputs.cornerRadius = chosen(request.inputs.cornerRadius.value)
  return request
}

const refusal = (request, root = repoRoot) => {
  try {
    checkRequest(request, { repoRoot: root })
  } catch (error) {
    assert.ok(error instanceof GeneratorError)
    return error
  }
  assert.fail('expected a refusal')
}

const codesFor = (error, path) => error.issues.filter((issue) => issue.path === path).map((issue) => issue.code)

test('the synthetic fixture passes as non-fabrication', () => {
  assert.doesNotThrow(() => checkRequest(fixture(), { repoRoot }))
})

test('a fully qualifying fabrication request clears every input check', () => {
  const error = refusal(qualifying())
  // The spike has no fabrication-capable template, so this is the only remaining refusal.
  // This proves the guard does not simply refuse everything.
  assert.deepEqual(
    error.issues.map((issue) => issue.code),
    ['TEMPLATE_NOT_FABRICATION_CAPABLE'],
  )
})

test('refuses an estimate even when it cites a source', () => {
  const request = qualifying()
  request.inputs.plateSizeX.confidence = 'estimate'
  const error = refusal(request)
  assert.equal(error.code, 'FABRICATION_REFUSED')
  assert.deepEqual(codesFor(error, 'inputs.plateSizeX.confidence'), ['ESTIMATE_NOT_ALLOWED'])
})

test('refuses a missing or unknown confidence', () => {
  for (const confidence of [undefined, 'guess', '', null]) {
    const request = qualifying()
    if (confidence === undefined) delete request.inputs.plateSizeX.confidence
    else request.inputs.plateSizeX.confidence = confidence
    assert.deepEqual(codesFor(refusal(request), 'inputs.plateSizeX.confidence'), ['CONFIDENCE_NOT_QUALIFYING'], String(confidence))
  }
})

test('refuses a measured fact with no durable source', () => {
  for (const source of [undefined, null, '', 'calipers', { kind: 'measurement-record' }]) {
    const request = qualifying()
    if (source === undefined) delete request.inputs.plateSizeX.source
    else request.inputs.plateSizeX.source = source
    assert.deepEqual(codesFor(refusal(request), 'inputs.plateSizeX.source'), ['SOURCE_MISSING'], JSON.stringify(source))
  }
})

test('refuses a measured fact citing anything but a measurement record that exists', () => {
  const cases = [
    ['evidence/measurements/does-not-exist-2026-01-02.md', 'SOURCE_NOT_FOUND'],
    ['evidence/measurements/README.md', 'SOURCE_NOT_DURABLE'],
    ['app/public/previews/manifest.json', 'SOURCE_NOT_DURABLE'],
    ['catalog/components/x.json', 'SOURCE_NOT_DURABLE'],
    ['../outside-2026-01-02.md', 'SOURCE_NOT_DURABLE'],
    ['evidence/measurements/../../etc-2026-01-02.md', 'SOURCE_NOT_DURABLE'],
  ]
  for (const [record, code] of cases) {
    const request = qualifying()
    request.inputs.plateSizeX.source = { kind: 'measurement-record', record }
    assert.deepEqual(codesFor(refusal(request), 'inputs.plateSizeX.source'), [code], record)
  }
})

test('refuses a measurement record reached through a symlink out of the repository', () => {
  const outside = mkdtempSync(join(tmpdir(), 'generator-spike-outside-'))
  writeFileSync(join(outside, 'target.md'), '# outside\n')
  const linked = 'evidence/measurements/linked-widget-width-2026-01-02.md'
  symlinkSync(join(outside, 'target.md'), join(repoRoot, linked))
  const request = qualifying()
  request.inputs.plateSizeX.source = { kind: 'measurement-record', record: linked }
  assert.deepEqual(codesFor(refusal(request), 'inputs.plateSizeX.source'), ['SOURCE_NOT_FOUND'])
  rmSync(outside, { recursive: true, force: true })
})

test('refuses repository evidence reached through any symlinked ancestor', () => {
  const outside = mkdtempSync(join(tmpdir(), 'generator-spike-outside-'))
  for (const directory of ['measurements', 'datasheets', 'coupons']) {
    mkdirSync(join(outside, directory), { recursive: true })
  }
  writeFileSync(join(outside, 'measurements/spike-widget-width-2026-01-02.md'), '# outside measurement\n')
  writeFileSync(join(outside, 'datasheets/widget.pdf'), 'outside datasheet')
  writeFileSync(join(outside, 'coupons/spike-coupon.md'), '# outside coupon\n')
  for (const directory of ['measurements', 'datasheets', 'coupons']) {
    rmSync(join(repoRoot, `evidence/${directory}`), { recursive: true, force: true })
    symlinkSync(join(outside, directory), join(repoRoot, `evidence/${directory}`), 'dir')
  }

  const measurement = qualifying()
  assert.deepEqual(codesFor(refusal(measurement), 'inputs.plateSizeX.source'), ['SOURCE_NOT_FOUND'])
  const sheet = qualifying()
  sheet.inputs.plateSizeY.source.uri = 'evidence/datasheets/widget.pdf'
  assert.deepEqual(codesFor(refusal(sheet), 'inputs.plateSizeY.source'), ['SOURCE_NOT_FOUND'])
  const coupon = qualifying()
  coupon.inputs.cornerRadius.testEvidence = { status: 'recorded', reference: COUPON }
  assert.deepEqual(codesFor(refusal(coupon), 'inputs.cornerRadius.testEvidence'), ['TEST_EVIDENCE_NOT_FOUND'])
  rmSync(outside, { recursive: true, force: true })
})

test('accepts a canonical repository reached through a symlinked root alias', () => {
  const aliasParent = mkdtempSync(join(tmpdir(), 'generator-spike-alias-'))
  const alias = join(aliasParent, 'repo')
  symlinkSync(repoRoot, alias, 'dir')
  assert.deepEqual(codesFor(refusal(qualifying(), alias), 'inputs.plateSizeX.source'), [])
  rmSync(aliasParent, { recursive: true, force: true })
})

test('refuses an internal symlink even when its target stays in the repository', () => {
  const linked = 'evidence/measurements/internal-widget-width-2026-01-02.md'
  symlinkSync(join(repoRoot, RECORD), join(repoRoot, linked))
  const request = qualifying()
  request.inputs.plateSizeX.source = { kind: 'measurement-record', record: linked }
  assert.deepEqual(codesFor(refusal(request), 'inputs.plateSizeX.source'), ['SOURCE_NOT_FOUND'])
})

test('refuses a confidence and source kind that disagree', () => {
  const request = qualifying()
  request.inputs.plateSizeX.confidence = 'datasheet' // still cites a measurement record
  assert.deepEqual(codesFor(refusal(request), 'inputs.plateSizeX.source'), ['SOURCE_KIND_MISMATCH'])
})

test('refuses a datasheet source without a title, locator or durable uri', () => {
  for (const patch of [{ title: '' }, { title: 'TODO' }, { locator: undefined }, { locator: 'n/a' }, { uri: 'ftp://x/y.pdf' }, { uri: 'file:///tmp/x.pdf' }, { uri: '' }]) {
    const request = qualifying()
    request.inputs.plateSizeY.source = { ...request.inputs.plateSizeY.source, ...patch }
    const error = refusal(request)
    assert.deepEqual(codesFor(error, 'inputs.plateSizeY.source'), ['SOURCE_NOT_DURABLE'], JSON.stringify(patch))
  }
})

test('accepts a repository-relative datasheet that exists and refuses one that does not', () => {
  mkdirSync(join(repoRoot, 'evidence/datasheets'), { recursive: true })
  writeFileSync(join(repoRoot, 'evidence/datasheets/widget.pdf'), 'pdf')
  const present = qualifying()
  present.inputs.plateSizeY.source.uri = 'evidence/datasheets/widget.pdf'
  assert.deepEqual(codesFor(refusal(present), 'inputs.plateSizeY.source'), [])
  const absent = qualifying()
  absent.inputs.plateSizeY.source.uri = 'evidence/datasheets/missing.pdf'
  assert.deepEqual(codesFor(refusal(absent), 'inputs.plateSizeY.source'), ['SOURCE_NOT_FOUND'])
})

test('refuses a design parameter missing its author or rationale', () => {
  for (const field of ['author', 'rationale']) {
    for (const value of [undefined, '', '  ', 'TODO', 7]) {
      const request = qualifying()
      if (value === undefined) delete request.inputs.cornerRadius[field]
      else request.inputs.cornerRadius[field] = value
      assert.deepEqual(codesFor(refusal(request), `inputs.cornerRadius.${field}`), ['DESIGN_PARAMETER_INCOMPLETE'], `${field}=${value}`)
    }
  }
})

test('refuses a design parameter that never states whether test evidence applies', () => {
  for (const evidence of [undefined, null, {}, { status: 'maybe' }, { status: 'not-applicable' }, { status: 'not-applicable', reason: ' ' }, { status: 'recorded' }]) {
    const request = qualifying()
    if (evidence === undefined) delete request.inputs.cornerRadius.testEvidence
    else request.inputs.cornerRadius.testEvidence = evidence
    assert.deepEqual(codesFor(refusal(request), 'inputs.cornerRadius.testEvidence'), ['TEST_EVIDENCE_REQUIRED'], JSON.stringify(evidence))
  }
})

test('refuses recorded test evidence that does not exist, and accepts it when it does', () => {
  const absent = qualifying()
  absent.inputs.cornerRadius.testEvidence = { status: 'recorded', reference: 'evidence/coupons/absent.md' }
  assert.deepEqual(codesFor(refusal(absent), 'inputs.cornerRadius.testEvidence'), ['TEST_EVIDENCE_NOT_FOUND'])
  const present = qualifying()
  present.inputs.cornerRadius.testEvidence = { status: 'recorded', reference: COUPON }
  assert.deepEqual(codesFor(refusal(present), 'inputs.cornerRadius.testEvidence'), [])
})

test('refuses synthetic values in a fabrication request', () => {
  const request = fixture()
  request.purpose = 'fabrication'
  const error = refusal(request)
  assert.equal(error.code, 'FABRICATION_REFUSED')
  assert.deepEqual(codesFor(error, 'inputs.plateSizeX'), ['SYNTHETIC_IN_FABRICATION'])
  assert.deepEqual(codesFor(error, 'template'), ['TEMPLATE_NOT_FABRICATION_CAPABLE'])
})

test('a non-fabrication request may only carry synthetic values', () => {
  for (const make of [measured, datasheet, chosen]) {
    const request = fixture()
    request.inputs.plateSizeX = make(10)
    const error = refusal(request)
    assert.equal(error.code, 'REQUEST_INVALID')
    assert.deepEqual(codesFor(error, 'inputs.plateSizeX'), ['NON_FABRICATION_REQUIRES_SYNTHETIC'])
  }
})

test('names every failing input in one report', () => {
  const request = qualifying()
  request.inputs.plateSizeX.confidence = 'estimate'
  delete request.inputs.plateThickness.source
  delete request.inputs.cornerRadius.rationale
  const error = refusal(request)
  assert.deepEqual(codesFor(error, 'inputs.plateSizeX.confidence'), ['ESTIMATE_NOT_ALLOWED'])
  assert.deepEqual(codesFor(error, 'inputs.plateThickness.source'), ['SOURCE_MISSING'])
  assert.deepEqual(codesFor(error, 'inputs.cornerRadius.rationale'), ['DESIGN_PARAMETER_INCOMPLETE'])
  assert.deepEqual(codesFor(error, 'template'), ['TEMPLATE_NOT_FABRICATION_CAPABLE'])
  assert.match(error.message, /plateSizeX/)
})

test('binds inputs to the template: unknown, missing and unknown-template are refused', () => {
  const unknown = fixture()
  unknown.inputs.hingeOffset = { class: 'synthetic', value: 1 }
  assert.deepEqual(codesFor(refusal(unknown), 'inputs.hingeOffset'), ['INPUT_NOT_CONSUMED'])

  const missing = fixture()
  delete missing.inputs.pocketDepth
  assert.deepEqual(codesFor(refusal(missing), 'inputs.pocketDepth'), ['INPUT_MISSING'])

  const wrongTemplate = fixture()
  wrongTemplate.template.id = 'deck-001-bracket'
  assert.deepEqual(codesFor(refusal(wrongTemplate), 'template.id'), ['TEMPLATE_UNKNOWN'])

  const wrongRevision = fixture()
  wrongRevision.template.revision = 2
  assert.deepEqual(codesFor(refusal(wrongRevision), 'template.revision'), ['TEMPLATE_REVISION_UNKNOWN'])
})
