import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeKernelError, loadEngine } from './engine.mjs'
import { EXIT, GeneratorError } from './errors.mjs'
import { checkRequest } from './guard.mjs'
import { buildManifest, canonicalJson, hashFiles, hashGeneratorSource } from './manifest.mjs'
import { parseRequest } from './request.mjs'
import {
  STL_ANGULAR_DEFLECTION_RAD,
  STL_LINEAR_DEFLECTION_MM,
  buildSyntheticPlate,
  expectedGeometry,
  preflight,
} from './synthetic-plate.mjs'
import { analyzeBinaryStl, analyzeStepText, normalizeStep, normalizeStl, reportDimensions, verifyPart } from './verify.mjs'

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

export function readRequestFile(requestPath) {
  let text
  try {
    text = readFileSync(requestPath, 'utf8')
  } catch (cause) {
    throw new GeneratorError('REQUEST_UNREADABLE', `Cannot read request "${requestPath}": ${cause.message}`, { exitCode: EXIT.REFUSED })
  }
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new GeneratorError('REQUEST_UNREADABLE', `Request "${requestPath}" is not valid JSON: ${cause.message}`, { exitCode: EXIT.REFUSED })
  }
}

const NAMES = Object.freeze({
  stl: 'NON-FABRICATION-synthetic-plate-r1.stl',
  step: 'NON-FABRICATION-synthetic-plate-r1.step',
  manifest: 'manifest.json',
})

function ensureCleanOutputDir(outDir) {
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    throw new GeneratorError('OUTPUT_DIR_NOT_EMPTY', `Output directory "${outDir}" is not empty. A clean run needs an empty or absent directory.`, { stage: 'output', exitCode: EXIT.REFUSED })
  }
}

async function kernelAsync(engine, stage, operation) {
  try {
    return await operation()
  } catch (thrown) {
    if (thrown instanceof GeneratorError) throw thrown
    throw new GeneratorError('KERNEL_FAILURE', `Kernel failed at stage "${stage}": ${describeKernelError(engine.oc, thrown)}`, { stage, exitCode: EXIT.GEOMETRY })
  }
}

const blobBytes = async (blob) => new Uint8Array(await blob.arrayBuffer())

async function exportPrimary(engine, solid) {
  const stl = await kernelAsync(engine, 'export-stl', async () =>
    blobBytes(solid.blobSTL({ binary: true, tolerance: STL_LINEAR_DEFLECTION_MM, angularTolerance: STL_ANGULAR_DEFLECTION_RAD })),
  )
  const step = await kernelAsync(engine, 'export-step', async () => blobBytes(solid.blobSTEP()))
  return { stl: normalizeStl(stl), step: normalizeStep(step) }
}

async function reimportStep(engine, stepBytes) {
  return kernelAsync(engine, 'reimport-step', async () => {
    const shape = await engine.replicad.importSTEP(new Blob([stepBytes]))
    const analyzer = new engine.oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)
    const valid = analyzer.IsValid()
    analyzer.delete()
    const { bounds } = shape.boundingBox
    return {
      solidCount: shape.solids.length,
      valid,
      boundsMm: [bounds[0], bounds[1]],
      dimensionsMm: reportDimensions([bounds[0], bounds[1]]),
      volumeMm3: engine.replicad.measureVolume(shape),
    }
  })
}

/** Stages every file next to the destination, then moves it into place in one rename. */
function writeOutputs(outDir, files) {
  const target = resolve(outDir)
  mkdirSync(dirname(target), { recursive: true })
  const staging = mkdtempSync(`${target}.staging-`)
  try {
    for (const [name, bytes] of Object.entries(files)) writeFileSync(join(staging, name), bytes)
    if (existsSync(target)) rmdirSync(target)
    renameSync(staging, target)
  } catch (cause) {
    rmSync(staging, { recursive: true, force: true })
    throw new GeneratorError('OUTPUT_WRITE_FAILED', `Could not write outputs to "${outDir}": ${cause.message}`, { stage: 'output', exitCode: EXIT.INTERNAL, cause })
  }
}

/**
 * Runs the pipeline. Nothing is written until every check has passed.
 * `deps` lets tests substitute the kernel-side builder; the CLI never passes it.
 */
export async function generate({ requestPath, outDir, repoRoot = REPO_ROOT, deps = {} }) {
  const started = performance.now()
  const request = parseRequest(readRequestFile(requestPath))
  const template = checkRequest(request, { repoRoot })
  const values = Object.fromEntries(Object.entries(request.inputs).map(([name, input]) => [name, input.value]))
  const preflightIssues = preflight(values)
  if (preflightIssues.length > 0) {
    throw new GeneratorError(
      'PREFLIGHT_FAILED',
      `Geometry refused before the kernel: ${preflightIssues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
      { stage: 'preflight', issues: preflightIssues, exitCode: EXIT.GEOMETRY },
    )
  }
  ensureCleanOutputDir(outDir)

  const engineStart = performance.now()
  const engine = await (deps.loadEngine ?? loadEngine)()
  const engineLoadMs = performance.now() - engineStart

  const built = (deps.buildPart ?? buildSyntheticPlate)(engine, values)
  const { stl, step } = await exportPrimary(engine, built.solid)
  const stlAnalysis = analyzeBinaryStl(stl)
  const stepAnalysis = analyzeStepText(step)
  const stepReimport = await reimportStep(engine, step)
  const expected = expectedGeometry(values)
  const issues = verifyPart({ expected, built, stl: stlAnalysis, step: stepAnalysis, stepReimport })
  if (issues.length > 0) {
    throw new GeneratorError(
      'VERIFICATION_FAILED',
      `Generated part failed verification: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
      { stage: 'verify-output', issues, exitCode: EXIT.VERIFICATION },
    )
  }

  const manifest = buildManifest({
    request,
    template,
    built,
    expected,
    stl: stlAnalysis,
    step: stepAnalysis,
    stepReimport,
    versions: engine.versions,
    kernelMessages: engine.messages,
    outputs: hashFiles({ [NAMES.stl]: stl, [NAMES.step]: step }),
    generatorSourceSha256: hashGeneratorSource(),
    stepOpenCascade: new TextDecoder().decode(step).match(/'(Open CASCADE \d+[\d.]*)'/)?.[1] ?? 'unknown',
  })
  const manifestBytes = new TextEncoder().encode(canonicalJson(manifest))
  writeOutputs(outDir, { [NAMES.stl]: stl, [NAMES.step]: step, [NAMES.manifest]: manifestBytes })

  return {
    status: 'ok',
    purpose: request.purpose,
    outDir,
    outputs: manifest.outputs,
    manifestSha256: hashFiles({ manifest: manifestBytes })[0].sha256,
    geometry: {
      solidCount: manifest.geometry.solidCount,
      dimensionsMm: manifest.geometry.dimensionsMm,
      volumeMm3: manifest.geometry.volumeMm3,
    },
    // Timings vary between runs, so they appear only here and never in the manifest.
    observations: {
      wallMs: Math.round(performance.now() - started),
      engineLoadMs: Math.round(engineLoadMs),
      rssBytes: process.memoryUsage().rss,
    },
  }
}
