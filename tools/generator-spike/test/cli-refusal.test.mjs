import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REJECTED, SYNTHETIC, fixturePath, listTree, readFixture, runCli, scratch, writeRequest } from './support.mjs'

const parseDiagnostic = (result) => {
  assert.notEqual(result.stderr.trim(), '', 'a refusal prints a diagnostic')
  return JSON.parse(result.stderr)
}

test('the committed rejected-fabrication fixture is refused and writes nothing', () => {
  const dir = scratch('rejected')
  const out = join(dir, 'out')
  const result = runCli(['--request', fixturePath(REJECTED), '--out', out])
  assert.equal(result.status, 2, result.stderr)
  assert.equal(result.stdout, '', 'no success output')
  assert.equal(existsSync(out), false, 'the output directory must not be created')
  assert.deepEqual(listTree(dir), [], 'the scratch directory stays empty')
  const diagnostic = parseDiagnostic(result)
  assert.equal(diagnostic.code, 'FABRICATION_REFUSED')
  assert.equal(diagnostic.stage, 'guard')
  assert.equal(diagnostic.artifactsWritten, false)
  const codes = new Set(diagnostic.issues.map((issue) => issue.code))
  for (const code of ['ESTIMATE_NOT_ALLOWED', 'SOURCE_MISSING', 'CONFIDENCE_NOT_QUALIFYING', 'DESIGN_PARAMETER_INCOMPLETE', 'TEST_EVIDENCE_REQUIRED', 'SYNTHETIC_IN_FABRICATION', 'TEMPLATE_NOT_FABRICATION_CAPABLE']) {
    assert.ok(codes.has(code), `diagnostic names ${code}: ${[...codes]}`)
  }
  rmSync(dir, { recursive: true, force: true })
})

test('the synthetic fixture cannot be relabelled for fabrication', () => {
  const dir = scratch('relabel')
  const out = join(dir, 'out')
  const request = readFixture(SYNTHETIC)
  request.purpose = 'fabrication'
  const result = runCli(['--request', writeRequest(dir, request), '--out', out])
  assert.equal(result.status, 2, result.stderr)
  assert.equal(existsSync(out), false)
  const diagnostic = parseDiagnostic(result)
  assert.equal(diagnostic.code, 'FABRICATION_REFUSED')
  assert.ok(diagnostic.issues.some((issue) => issue.code === 'TEMPLATE_NOT_FABRICATION_CAPABLE'))
  rmSync(dir, { recursive: true, force: true })
})

test('a refused request leaves an existing output directory untouched', () => {
  const dir = scratch('existing')
  const out = join(dir, 'out')
  mkdirSync(out)
  writeFileSync(join(out, 'keep.txt'), 'existing')
  const result = runCli(['--request', fixturePath(REJECTED), '--out', out])
  assert.equal(result.status, 2)
  assert.deepEqual(listTree(out), ['keep.txt'])
  rmSync(dir, { recursive: true, force: true })
})

test('bad invocations and unreadable requests are diagnosed without writing', () => {
  const dir = scratch('bad')
  const out = join(dir, 'out')
  const cases = [
    [[], 'USAGE'],
    [['--request', join(dir, 'absent.json'), '--out', out], 'REQUEST_UNREADABLE'],
    [['--request', writeRequest(dir, '{not json', 'broken.json'), '--out', out], 'REQUEST_UNREADABLE'],
    [['--request', writeRequest(dir, { schema: 'wrong' }, 'wrong.json'), '--out', out], 'REQUEST_INVALID'],
  ]
  for (const [args, code] of cases) {
    const result = runCli(args)
    assert.equal(result.status, 2, `${args}: ${result.stderr}`)
    assert.equal(parseDiagnostic(result).code, code, String(args))
    assert.equal(existsSync(out), false, String(args))
  }
  rmSync(dir, { recursive: true, force: true })
})

test('infeasible geometry is diagnosed before the kernel and writes nothing', () => {
  const dir = scratch('preflight')
  const out = join(dir, 'out')
  const request = readFixture(SYNTHETIC)
  request.inputs.cornerRadius.value = 30
  const result = runCli(['--request', writeRequest(dir, request), '--out', out])
  assert.equal(result.status, 3, result.stderr)
  const diagnostic = parseDiagnostic(result)
  assert.equal(diagnostic.code, 'PREFLIGHT_FAILED')
  assert.equal(diagnostic.stage, 'preflight')
  assert.ok(diagnostic.issues.some((issue) => issue.code === 'CORNER_RADIUS_TOO_LARGE' && issue.path === 'inputs.cornerRadius'))
  assert.equal(existsSync(out), false)
  rmSync(dir, { recursive: true, force: true })
})

test('a successful CLI run prints machine-readable output and writes the labelled files', () => {
  const dir = scratch('success')
  const out = join(dir, 'out')
  const result = runCli(['--request', fixturePath(SYNTHETIC), '--out', out])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '', 'kernel console output must not leak into stderr')
  const summary = JSON.parse(result.stdout)
  assert.equal(summary.status, 'ok')
  assert.equal(summary.purpose, 'non-fabrication')
  assert.deepEqual(listTree(out), ['NON-FABRICATION-synthetic-plate-r1.step', 'NON-FABRICATION-synthetic-plate-r1.stl', 'manifest.json'])
  rmSync(dir, { recursive: true, force: true })
})
