import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { generate } from '../src/generate.mjs'
import { loadEngine } from '../src/engine.mjs'
import { SYNTHETIC, fixturePath, runCli, scratch } from './support.mjs'

const NAMES = ['NON-FABRICATION-synthetic-plate-r1.stl', 'NON-FABRICATION-synthetic-plate-r1.step', 'manifest.json']
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

const cliRun = () => {
  const dir = scratch('determinism')
  const out = join(dir, 'out')
  const result = runCli(['--request', fixturePath(SYNTHETIC), '--out', out])
  assert.equal(result.status, 0, result.stderr)
  const hashes = Object.fromEntries(NAMES.map((name) => [name, sha256(join(out, name))]))
  rmSync(dir, { recursive: true, force: true })
  return { hashes, summary: JSON.parse(result.stdout) }
}

test('two clean separate-process CLI runs are byte-identical', () => {
  const first = cliRun()
  const second = cliRun()
  assert.deepEqual(first.hashes, second.hashes)
  assert.deepEqual(first.summary.outputs, second.summary.outputs, 'reported hashes agree')
  assert.equal(first.summary.manifestSha256, second.summary.manifestSha256)
})

test('the CLI reports hashes that match the written files', () => {
  const { hashes, summary } = cliRun()
  for (const output of summary.outputs) assert.equal(output.sha256, hashes[output.path], output.path)
  assert.deepEqual(summary.geometry.dimensionsMm, [73.5, 41.25, 6.125])
  assert.equal(summary.geometry.solidCount, 1)
})

test('repeating in one process with a reused kernel is byte-identical', async () => {
  const engine = await loadEngine()
  const run = async () => {
    const dir = scratch('in-process')
    const outDir = join(dir, 'out')
    await generate({ requestPath: fixturePath(SYNTHETIC), outDir, deps: { loadEngine: async () => engine } })
    const hashes = NAMES.slice(0, 2).map((name) => sha256(join(outDir, name)))
    rmSync(dir, { recursive: true, force: true })
    return hashes
  }
  assert.deepEqual(await run(), await run())
})
