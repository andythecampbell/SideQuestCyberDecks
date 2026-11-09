import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { checkEngineVersions, loadEngine } from '../src/engine.mjs'
import { GeneratorError } from '../src/errors.mjs'
import { buildSyntheticPlate, expectedGeometry } from '../src/synthetic-plate.mjs'
import { SYNTHETIC, readFixture } from './support.mjs'

const values = () => Object.fromEntries(Object.entries(readFixture(SYNTHETIC).inputs).map(([key, input]) => [key, input.value]))
let engine

before(async () => {
  engine = await loadEngine()
})

test('the engine reports exact versions and a hash of the WASM it loaded', () => {
  assert.equal(engine.versions.replicad, '1.2.1')
  assert.equal(engine.versions.replicadOpencascadejs, '1.2.1')
  assert.match(engine.versions.wasmSha256, /^[0-9a-f]{64}$/)
  assert.ok(engine.versions.wasmBytes > 1_000_000)
})

test('a version that differs from the pin is refused with a diagnostic', () => {
  assert.throws(
    () => checkEngineVersions({ replicad: '1.2.0', 'replicad-opencascadejs': '1.2.1' }, { replicad: '1.2.1', 'replicad-opencascadejs': '1.2.1' }),
    (error) => error instanceof GeneratorError && error.code === 'ENGINE_VERSION_MISMATCH' && /replicad/.test(error.message),
  )
})

test('builds one solid, reporting the exact volume change of every operation', () => {
  const v = values()
  const built = buildSyntheticPlate(engine, v)
  assert.equal(built.solidCount, 1)
  assert.deepEqual(built.stages.map((stage) => stage.stage), ['plate', 'corner-fillet', 'through-cut', 'pocket', 'hole-1', 'hole-2', 'hole-3'])

  const volume = (stage) => built.stages.find((entry) => entry.stage === stage).volumeMm3
  const close = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} vs ${expected}`)
  const area = (d) => Math.PI * (d / 2) ** 2
  close(volume('plate'), v.plateSizeX * v.plateSizeY * v.plateThickness, 'plate')
  close(volume('corner-fillet'), (v.plateSizeX * v.plateSizeY - (4 - Math.PI) * v.cornerRadius ** 2) * v.plateThickness, 'fillet')
  close(volume('corner-fillet') - volume('through-cut'), v.throughCutSizeX * v.throughCutSizeY * v.plateThickness, 'through-cut')
  close(volume('through-cut') - volume('pocket'), v.pocketSizeX * v.pocketSizeY * v.pocketDepth, 'pocket')
  close(volume('pocket') - volume('hole-1'), area(v.hole1Diameter) * v.plateThickness, 'hole 1')
  close(volume('hole-1') - volume('hole-2'), area(v.hole2Diameter) * v.plateThickness, 'hole 2')
  close(volume('hole-2') - volume('hole-3'), area(v.hole3Diameter) * v.plateThickness, 'hole 3')
})

test('the finished solid matches the expected dimensions and passes the kernel validity check', () => {
  const v = values()
  const built = buildSyntheticPlate(engine, v)
  assert.equal(built.valid, true)
  const expected = expectedGeometry(v)
  // Reported dimensions are max - min and are exact. The fillet leaves its tangent vertices about
  // 4e-16 mm from zero (observed, retained in evidence as log 06b); the raw values are reported as they are.
  assert.deepEqual([0, 1, 2].map((axis) => built.boundsMm[1][axis] - built.boundsMm[0][axis]), expected.dimensionsMm)
  built.boundsMm.flat().forEach((value, index) => assert.ok(Math.abs(value - expected.boundsMm.flat()[index]) <= 1e-9, `${index}: ${value}`))
  assert.ok(Math.abs(built.volumeMm3 - expected.volumeMm3) < 1e-6, `${built.volumeMm3} vs ${expected.volumeMm3}`)
})

test('a kernel failure names the failing stage and carries the kernel message', () => {
  const v = values()
  v.cornerRadius = v.plateSizeY // Skips preflight on purpose: this radius cannot be filleted.
  assert.throws(
    () => buildSyntheticPlate(engine, v),
    (error) => {
      assert.ok(error instanceof GeneratorError, String(error))
      assert.equal(error.code, 'KERNEL_FAILURE')
      assert.equal(error.stage, 'corner-fillet')
      assert.equal(error.exitCode, 3)
      assert.ok(error.message.length > 20, error.message)
      return true
    },
  )
})
