import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generate } from '../src/generate.mjs'
import { GeneratorError } from '../src/errors.mjs'
import { buildSyntheticPlate } from '../src/synthetic-plate.mjs'
import { analyzeBinaryStl, analyzeStepText, NORMALIZED_STEP_TIMESTAMP } from '../src/verify.mjs'
import { SYNTHETIC, fixturePath, listTree, readFixture, scratch } from './support.mjs'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const STL = 'NON-FABRICATION-synthetic-plate-r1.stl'
const STEP = 'NON-FABRICATION-synthetic-plate-r1.step'

async function runFixture(deps) {
  const dir = scratch('generate')
  const outDir = join(dir, 'out')
  const summary = await generate({ requestPath: fixturePath(SYNTHETIC), outDir, deps })
  return { dir, outDir, summary, manifest: JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')) }
}

test('writes exactly the labelled STL, STEP and manifest', async () => {
  const { dir, outDir, summary } = await runFixture()
  assert.deepEqual(listTree(outDir), [STL, STEP, 'manifest.json'].sort())
  assert.equal(summary.status, 'ok')
  assert.equal(summary.purpose, 'non-fabrication')
  rmSync(dir, { recursive: true, force: true })
})

test('the STL is one closed oriented solid at the requested size with the expected holes', async () => {
  const { dir, outDir, manifest } = await runFixture()
  const analysis = analyzeBinaryStl(readFileSync(join(outDir, STL)))
  assert.equal(analysis.watertight, true)
  assert.equal(analysis.bodies, 1)
  assert.equal(analysis.genus, 4, 'one through-cut plus three through-holes')
  const dimensions = [0, 1, 2].map((axis) => analysis.boundsMm[1][axis] - analysis.boundsMm[0][axis])
  assert.deepEqual(dimensions, [73.5, 41.25, 6.125], 'exact, including float32 STL precision')
  assert.deepEqual(manifest.geometry.stl.dimensionsMm, dimensions)
  rmSync(dir, { recursive: true, force: true })
})

test('the STEP file declares millimetres and one closed solid, with the timestamp normalized', async () => {
  const { dir, outDir, manifest } = await runFixture()
  const analysis = analyzeStepText(readFileSync(join(outDir, STEP)))
  assert.equal(analysis.manifoldSolidBreps, 1)
  assert.equal(analysis.closedShells, 1)
  assert.equal(analysis.openShells, 0)
  assert.equal(analysis.declaredLengthUnit, 'mm')
  assert.equal(analysis.timestamp, NORMALIZED_STEP_TIMESTAMP)
  assert.equal(manifest.geometry.stepReimport.solidCount, 1)
  assert.equal(manifest.geometry.stepReimport.valid, true)
  assert.deepEqual(manifest.geometry.stepReimport.dimensionsMm, [73.5, 41.25, 6.125])
  rmSync(dir, { recursive: true, force: true })
})

test('the manifest records the exact inputs, versions, settings, hashes and measurements', async () => {
  const { dir, outDir, manifest } = await runFixture()
  assert.equal(manifest.purpose, 'non-fabrication')
  assert.equal(manifest.fabricationEligible, false)
  assert.match(manifest.label, /NON-FABRICATION/)
  assert.deepEqual(manifest.request, readFixture(SYNTHETIC), 'exact inputs, unmodified')
  assert.equal(manifest.units, 'mm')
  assert.equal(manifest.generator.name, '@sidequest/generator-spike')
  assert.equal(manifest.generator.version, '0.1.0')
  assert.deepEqual(manifest.generator.template, { id: 'synthetic-plate', revision: 1 })
  assert.match(manifest.generator.sourceSha256, /^[0-9a-f]{64}$/)
  assert.equal(manifest.engine.replicad, '1.2.1')
  assert.equal(manifest.engine.replicadOpencascadejs, '1.2.1')
  assert.match(manifest.engine.wasmSha256, /^[0-9a-f]{64}$/)
  assert.match(manifest.engine.openCascadeReported, /^Open CASCADE \d/)
  assert.equal(manifest.runtime.node, process.version)
  assert.equal(manifest.runtime.platform, process.platform)
  assert.equal(manifest.runtime.arch, process.arch)
  assert.deepEqual(manifest.geometry.solidCount, 1)
  assert.deepEqual(manifest.geometry.dimensionsMm, [73.5, 41.25, 6.125])
  assert.deepEqual(manifest.geometry.stages.map((s) => s.stage).slice(0, 2), ['plate', 'corner-fillet'])
  assert.equal(manifest.exportSettings.stl.format, 'binary')
  assert.equal(manifest.exportSettings.stl.linearDeflectionMm, 0.01)
  assert.equal(manifest.exportSettings.stl.angularDeflectionRad, 0.1)
  assert.match(manifest.exportSettings.stl.header, /NON-FABRICATION/)
  assert.equal(manifest.exportSettings.step.schema, 'AP242')
  assert.equal(manifest.exportSettings.step.timestampNormalizedTo, NORMALIZED_STEP_TIMESTAMP)
  assert.equal(manifest.diagnostics.status, 'passed')
  assert.ok(Array.isArray(manifest.diagnostics.kernelMessages))

  const byName = Object.fromEntries(manifest.outputs.map((output) => [output.path, output]))
  for (const name of [STL, STEP]) {
    const bytes = readFileSync(join(outDir, name))
    assert.equal(byName[name].sha256, sha256(bytes), name)
    assert.equal(byName[name].bytes, bytes.length, name)
    assert.equal(byName[name].role, 'primary')
  }
  rmSync(dir, { recursive: true, force: true })
})

test('the manifest contains no wall-clock time or local path', async () => {
  const { dir, outDir } = await runFixture()
  const text = readFileSync(join(outDir, 'manifest.json'), 'utf8')
  assert.equal(text.includes(dir), false, 'no absolute output path')
  assert.equal(text.includes(process.cwd()), false, 'no absolute working directory')
  assert.doesNotMatch(text, /\b20\d\d-\d{2}-\d{2}T/, 'no wall-clock timestamp')
  rmSync(dir, { recursive: true, force: true })
})

test('a clean run refuses a non-empty output directory and leaves it alone', async () => {
  const dir = scratch('nonempty')
  const outDir = join(dir, 'out')
  mkdirSync(outDir)
  writeFileSync(join(outDir, 'keep.txt'), 'existing')
  await assert.rejects(
    generate({ requestPath: fixturePath(SYNTHETIC), outDir }),
    (error) => error instanceof GeneratorError && error.code === 'OUTPUT_DIR_NOT_EMPTY' && error.message.includes(outDir),
  )
  assert.deepEqual(listTree(outDir), ['keep.txt'])
  rmSync(dir, { recursive: true, force: true })
})

test('an empty existing output directory is acceptable', async () => {
  const dir = scratch('empty')
  const outDir = join(dir, 'out')
  mkdirSync(outDir)
  await generate({ requestPath: fixturePath(SYNTHETIC), outDir })
  assert.ok(existsSync(join(outDir, 'manifest.json')))
  rmSync(dir, { recursive: true, force: true })
})

/** Builds the real part, then changes one thing, so the output checks can be seen to catch it. */
const sabotaged = (change) => (engine, v) => buildSyntheticPlate(engine, change({ ...v }))

test('wrong dimensions fail verification and write nothing', async () => {
  const dir = scratch('wrong-size')
  const outDir = join(dir, 'out')
  await assert.rejects(
    generate({ requestPath: fixturePath(SYNTHETIC), outDir, deps: { buildPart: sabotaged((v) => ({ ...v, plateSizeX: v.plateSizeX + 1 })) } }),
    (error) => {
      assert.equal(error.code, 'VERIFICATION_FAILED', error.message)
      assert.equal(error.stage, 'verify-output')
      assert.equal(error.exitCode, 4)
      assert.ok(error.issues.some((issue) => issue.path === 'geometry.dimensionsMm'), JSON.stringify(error.issues))
      return true
    },
  )
  assert.equal(existsSync(outDir), false)
  assert.deepEqual(listTree(dir), [])
  rmSync(dir, { recursive: true, force: true })
})

test('an undersized hole fails the volume check and writes nothing', async () => {
  const dir = scratch('wrong-volume')
  const outDir = join(dir, 'out')
  await assert.rejects(
    generate({ requestPath: fixturePath(SYNTHETIC), outDir, deps: { buildPart: sabotaged((v) => ({ ...v, hole3Diameter: 2.5 })) } }),
    (error) => {
      assert.equal(error.code, 'VERIFICATION_FAILED')
      assert.ok(error.issues.some((issue) => issue.path === 'geometry.volumeMm3'), JSON.stringify(error.issues))
      return true
    },
  )
  assert.equal(existsSync(outDir), false)
  rmSync(dir, { recursive: true, force: true })
})

test('more than one solid fails and writes nothing', async () => {
  const dir = scratch('two-solids')
  const outDir = join(dir, 'out')
  await assert.rejects(
    generate({
      requestPath: fixturePath(SYNTHETIC),
      outDir,
      deps: {
        buildPart: (engine, v) => {
          const built = buildSyntheticPlate(engine, v)
          return { ...built, solidCount: 2 }
        },
      },
    }),
    (error) => error.code === 'VERIFICATION_FAILED' && error.issues.some((issue) => issue.path === 'geometry.solidCount'),
  )
  assert.equal(existsSync(outDir), false)
  rmSync(dir, { recursive: true, force: true })
})
