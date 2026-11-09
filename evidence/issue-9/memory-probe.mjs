// Packaging/runtime observation only: reuses one kernel across repeated runs and reports RSS.
// Run from tools/generator-spike so package resolution finds the pinned engine.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const toolDir = process.argv[2]
const { generate } = await import(pathToFileURL(join(toolDir, 'src/generate.mjs')).href)
const { loadEngine } = await import(pathToFileURL(join(toolDir, 'src/engine.mjs')).href)
const request = join(toolDir, 'fixtures/synthetic-plate.non-fabrication.request.json')
const iterations = Number(process.argv[3] ?? 25)
const engine = await loadEngine()
const report = { iterations, node: process.version, samples: [] }
const sampleEvery = Math.max(1, Math.floor(iterations / 5))
for (let index = 1; index <= iterations; index += 1) {
  const scratch = mkdtempSync(join(tmpdir(), 'generator-spike-memory-'))
  const started = performance.now()
  await generate({ requestPath: request, outDir: join(scratch, 'out'), deps: { loadEngine: async () => engine } })
  const wallMs = Math.round(performance.now() - started)
  rmSync(scratch, { recursive: true, force: true })
  if (index === 1 || index % sampleEvery === 0) report.samples.push({ iteration: index, wallMs, rssMb: Math.round(process.memoryUsage().rss / 1048576) })
}
console.log(JSON.stringify(report, null, 2))
