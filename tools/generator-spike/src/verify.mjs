import { EXIT, GeneratorError } from './errors.mjs'

/** STEP's FILE_NAME timestamp is replaced with this fixed value. */
export const NORMALIZED_STEP_TIMESTAMP = '1970-01-01T00:00:00'

/** Fixed binary STL header. Exactly 80 bytes; never starts with "solid". */
export const STL_HEADER = 'NON-FABRICATION SIDEQUEST SPIKE synthetic-plate r1 units=mm no-timestamp'.padEnd(80, ' ')

/** float32 STL cannot represent every double; this bounds that representational noise only. */
const STL_NOISE_TOLERANCE_MM = 1e-6
/** Triangles at or below this geometric area are unusable even when vertices differ. */
const STL_MIN_TRIANGLE_AREA_MM2 = 1e-12

/** Fixed STEP product name. OpenCascade otherwise appends a process-wide counter to it. */
export const STEP_PRODUCT_NAME = 'NON-FABRICATION synthetic-plate r1'

const STEP_DESCRIPTION = 'NON-FABRICATION SIDEQUEST SPIKE synthetic-plate r1'

function malformed(code, message) {
  return new GeneratorError(code, message, { stage: 'verify-output', exitCode: EXIT.VERIFICATION })
}

export function normalizeStl(bytes) {
  if (bytes.length < 84) throw malformed('STL_MALFORMED', `Binary STL is ${bytes.length} bytes, smaller than its 84-byte header.`)
  const normalized = bytes.slice()
  normalized.set(new TextEncoder().encode(STL_HEADER), 0)
  return normalized
}

/**
 * Independent analysis of a binary STL. Uses no kernel code. Vertices are identified by
 * exact float32 equality; a vertex that differs by one bit is a distinct vertex.
 */
export function analyzeBinaryStl(bytes) {
  if (bytes.length < 84) throw malformed('STL_MALFORMED', `Binary STL is ${bytes.length} bytes, smaller than its 84-byte header.`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const triangles = view.getUint32(80, true)
  if (bytes.length !== 84 + triangles * 50) {
    throw malformed('STL_MALFORMED', `Binary STL declares ${triangles} triangles but is ${bytes.length} bytes (size must be ${84 + triangles * 50}).`)
  }
  const vertexIds = new Map()
  const lowest = [Infinity, Infinity, Infinity]
  const highest = [-Infinity, -Infinity, -Infinity]
  const vertexId = (x, y, z) => {
    const key = `${x},${y},${z}`
    let id = vertexIds.get(key)
    if (id === undefined) {
      id = vertexIds.size
      vertexIds.set(key, id)
    }
    return id
  }
  const edges = new Map()
  const addEdge = (from, to) => {
    const key = from < to ? `${from}:${to}` : `${to}:${from}`
    let edge = edges.get(key)
    if (edge === undefined) {
      edge = { forward: 0, backward: 0 }
      edges.set(key, edge)
    }
    if (from < to) edge.forward += 1
    else edge.backward += 1
  }
  const parents = []
  const find = (id) => {
    while (parents[id] !== id) {
      parents[id] = parents[parents[id]]
      id = parents[id]
    }
    return id
  }
  const union = (a, b) => {
    const [ra, rb] = [find(a), find(b)]
    if (ra !== rb) parents[ra] = rb
  }
  let degenerateTriangles = 0
  let signedVolumeMm3 = 0
  for (let index = 0; index < triangles; index += 1) {
    const base = 84 + index * 50 + 12
    const point = (slot) => [
      view.getFloat32(base + slot * 12, true),
      view.getFloat32(base + slot * 12 + 4, true),
      view.getFloat32(base + slot * 12 + 8, true),
    ]
    const [a, b, c] = [point(0), point(1), point(2)]
    for (const vertex of [a, b, c]) {
      vertex.forEach((value, axis) => {
        if (!Number.isFinite(value)) {
          throw malformed('STL_MALFORMED', `Binary STL triangle ${index} has a non-finite coordinate at axis ${axis}.`)
        }
        lowest[axis] = Math.min(lowest[axis], value)
        highest[axis] = Math.max(highest[axis], value)
      })
    }
    const ids = [a, b, c].map(([x, y, z]) => vertexId(x, y, z))
    for (const id of ids) {
      if (parents[id] === undefined) parents[id] = id
    }
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
    const area = Math.hypot(...cross) / 2
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[2] === ids[0] || area <= STL_MIN_TRIANGLE_AREA_MM2) {
      degenerateTriangles += 1
      continue
    }
    addEdge(ids[0], ids[1])
    addEdge(ids[1], ids[2])
    addEdge(ids[2], ids[0])
    union(ids[0], ids[1])
    union(ids[1], ids[2])
    signedVolumeMm3 +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
  }
  let boundaryEdges = 0
  let nonManifoldEdges = 0
  let inconsistentEdges = 0
  for (const edge of edges.values()) {
    const total = edge.forward + edge.backward
    if (total === 1) boundaryEdges += 1
    else if (total > 2) nonManifoldEdges += 1
    else if (edge.forward !== 1 || edge.backward !== 1) inconsistentEdges += 1
  }
  const vertexCount = vertexIds.size
  const edgeCount = edges.size
  const faceCount = triangles - degenerateTriangles
  const eulerCharacteristic = vertexCount - edgeCount + faceCount
  const roots = new Set()
  for (let id = 0; id < vertexCount; id += 1) roots.add(find(id))
  const bodies = roots.size
  const genus = (2 * bodies - eulerCharacteristic) / 2
  const closed = boundaryEdges === 0 && nonManifoldEdges === 0 && inconsistentEdges === 0 && degenerateTriangles === 0
  return {
    triangles,
    vertices: vertexCount,
    edges: edgeCount,
    boundaryEdges,
    nonManifoldEdges,
    inconsistentEdges,
    degenerateTriangles,
    bodies,
    eulerCharacteristic,
    genus,
    signedVolumeMm3,
    boundsMm: [lowest, highest],
    watertight: closed && signedVolumeMm3 > 0,
  }
}

const decoder = new TextDecoder('utf-8', { fatal: false })

const FILE_NAME_TIMESTAMP = /(FILE_NAME\s*\(\s*'[^']*'\s*,\s*')(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(')/g
const FILE_DESCRIPTION_VALUE = /(FILE_DESCRIPTION\s*\(\s*\(\s*')([^']*)(')/
const PRODUCT_NAMES = /(=\s*PRODUCT\s*\(\s*')Open CASCADE STEP translator [^']*('\s*,\s*')Open CASCADE STEP translator [^']*(')/g

/**
 * Removes the two things that vary between identical exports (the FILE_NAME wall-clock timestamp and
 * the process-wide PRODUCT counter) and labels the file as non-fabrication. Refuses to pass through
 * anything it cannot recognize, so neither can survive silently.
 */
export function normalizeStep(bytes) {
  const text = decoder.decode(bytes)
  const headerEnd = text.indexOf('ENDSEC;')
  if (headerEnd < 0 || !text.startsWith('ISO-10303-21;')) {
    throw malformed('STEP_NORMALIZATION_FAILED', 'STEP output has no recognizable ISO-10303-21 header.')
  }
  const header = text.slice(0, headerEnd)
  const timestamps = [...header.matchAll(FILE_NAME_TIMESTAMP)]
  if (timestamps.length !== 1) {
    throw malformed('STEP_NORMALIZATION_FAILED', `Expected exactly one FILE_NAME timestamp, found ${timestamps.length}.`)
  }
  if (!FILE_DESCRIPTION_VALUE.test(header)) {
    throw malformed('STEP_NORMALIZATION_FAILED', 'STEP header has no FILE_DESCRIPTION value to label.')
  }
  const normalizedHeader = header
    .replace(FILE_NAME_TIMESTAMP, `$1${NORMALIZED_STEP_TIMESTAMP}$3`)
    .replace(FILE_DESCRIPTION_VALUE, `$1${STEP_DESCRIPTION}$3`)
  const body = text.slice(headerEnd)
  const generatedNames = count(body, /Open CASCADE STEP translator/g)
  const products = [...body.matchAll(PRODUCT_NAMES)]
  const alreadyNormalized = generatedNames === 0 && body.includes(`PRODUCT('${STEP_PRODUCT_NAME}'`)
  if (!alreadyNormalized && (generatedNames !== 2 || products.length !== 1)) {
    throw malformed('STEP_NORMALIZATION_FAILED', `Expected exactly one generated PRODUCT name, found ${generatedNames} generated names across ${products.length} PRODUCT entities.`)
  }
  const normalizedBody = body.replace(PRODUCT_NAMES, `$1${STEP_PRODUCT_NAME}$2${STEP_PRODUCT_NAME}$3`)
  return new TextEncoder().encode(normalizedHeader + normalizedBody)
}

const count = (text, pattern) => (text.match(pattern) ?? []).length

/** Reads the exported STEP text directly, independent of the kernel's own view of the part. */
export function analyzeStepText(bytes) {
  const text = decoder.decode(bytes)
  const timestamp = [...text.matchAll(FILE_NAME_TIMESTAMP)][0]?.[2] ?? null
  const lengthUnit = /LENGTH_UNIT\s*\(\s*\)[^;]*SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text) ? 'mm' : 'unknown'
  return {
    manifoldSolidBreps: count(text, /\bMANIFOLD_SOLID_BREP\s*\(/g),
    closedShells: count(text, /\bCLOSED_SHELL\s*\(/g),
    openShells: count(text, /\bOPEN_SHELL\s*\(/g),
    declaredLengthUnit: lengthUnit,
    timestamp,
    schema: text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/)?.[1] ?? null,
  }
}

/** Largest allowed offset of the part's minimum corner from the origin; kernel float noise only. */
const BREP_NOISE_TOLERANCE_MM = 1e-9
const BREP_VOLUME_TOLERANCE_MM3 = 1e-6

const dimensionsOf = (bounds) => [0, 1, 2].map((axis) => bounds[1][axis] - bounds[0][axis])

/**
 * Compares what was built and exported against what the inputs specify. Returns one issue per
 * failed check. Exact dimensions are not tolerance-matched against an engineering allowance:
 * the only tolerances here are numeric representation limits, stated by name.
 */
export function verifyPart({ expected, built, stl, step, stepReimport }) {
  const issues = []
  const check = (ok, path, message) => {
    if (!ok) issues.push({ code: 'VERIFICATION_CHECK_FAILED', path, message })
  }
  const dimensions = dimensionsOf(built.boundsMm)
  check(built.solidCount === 1, 'geometry.solidCount', `Expected exactly one solid, found ${built.solidCount}.`)
  check(built.valid === true, 'geometry.valid', 'The kernel reports the solid as invalid.')
  check(
    dimensions.every((value, axis) => Math.abs(value - expected.dimensionsMm[axis]) <= BREP_NOISE_TOLERANCE_MM),
    'geometry.dimensionsMm',
    `B-rep dimensions ${dimensions} differ from the requested ${expected.dimensionsMm} mm.`,
  )
  check(
    built.boundsMm[0].every((value) => Math.abs(value) <= BREP_NOISE_TOLERANCE_MM),
    'geometry.boundsMm',
    `Part minimum corner ${built.boundsMm[0]} is not at the origin.`,
  )
  check(
    Math.abs(built.volumeMm3 - expected.volumeMm3) <= BREP_VOLUME_TOLERANCE_MM3,
    'geometry.volumeMm3',
    `B-rep volume ${built.volumeMm3} differs from the analytic ${expected.volumeMm3} mm^3.`,
  )

  check(stl.watertight === true, 'geometry.stl.watertight', `STL is not a closed oriented solid (boundary ${stl.boundaryEdges}, non-manifold ${stl.nonManifoldEdges}, inconsistent ${stl.inconsistentEdges}, degenerate ${stl.degenerateTriangles}, signed volume ${stl.signedVolumeMm3}).`)
  check(stl.bodies === 1, 'geometry.stl.bodies', `STL has ${stl.bodies} bodies, expected 1.`)
  check(stl.genus === expected.throughFeatureCount, 'geometry.stl.genus', `STL genus ${stl.genus} differs from the ${expected.throughFeatureCount} through-features requested.`)
  const stlDimensions = dimensionsOf(stl.boundsMm)
  check(
    stlDimensions.every((value, axis) => Math.abs(value - Math.fround(expected.dimensionsMm[axis])) <= STL_NOISE_TOLERANCE_MM),
    'geometry.stl.dimensionsMm',
    `STL dimensions ${stlDimensions} differ from the requested ${expected.dimensionsMm} mm at float32 precision.`,
  )
  check(
    Math.abs(stl.signedVolumeMm3 - expected.volumeMm3) <= expected.meshVolumeToleranceMm3,
    'geometry.stl.volumeMm3',
    `STL volume ${stl.signedVolumeMm3} is outside ${expected.meshVolumeToleranceMm3} mm^3 of the analytic ${expected.volumeMm3} mm^3.`,
  )

  check(step.manifoldSolidBreps === 1, 'geometry.step.manifoldSolidBreps', `STEP has ${step.manifoldSolidBreps} solids, expected 1.`)
  check(step.closedShells === 1, 'geometry.step.closedShells', `STEP has ${step.closedShells} closed shells, expected 1.`)
  check(step.openShells === 0, 'geometry.step.openShells', `STEP has ${step.openShells} open shells.`)
  check(step.declaredLengthUnit === 'mm', 'geometry.step.declaredLengthUnit', `STEP declares length unit "${step.declaredLengthUnit}", expected mm.`)
  check(step.timestamp === NORMALIZED_STEP_TIMESTAMP, 'geometry.step.timestamp', `STEP header timestamp is "${step.timestamp}".`)

  const reimported = dimensionsOf(stepReimport.boundsMm)
  check(stepReimport.solidCount === 1, 'geometry.stepReimport.solidCount', `Re-imported STEP has ${stepReimport.solidCount} solids.`)
  check(stepReimport.valid === true, 'geometry.stepReimport.valid', 'The re-imported STEP is invalid.')
  check(
    reimported.every((value, axis) => Math.abs(value - expected.dimensionsMm[axis]) <= BREP_NOISE_TOLERANCE_MM),
    'geometry.stepReimport.dimensionsMm',
    `Re-imported STEP dimensions ${reimported} differ from the requested ${expected.dimensionsMm} mm.`,
  )
  check(
    Math.abs(stepReimport.volumeMm3 - expected.volumeMm3) <= BREP_VOLUME_TOLERANCE_MM3,
    'geometry.stepReimport.volumeMm3',
    `Re-imported STEP volume ${stepReimport.volumeMm3} differs from the analytic ${expected.volumeMm3} mm^3.`,
  )
  return issues
}

/** Reported as [max - min] per axis. */
export const reportDimensions = dimensionsOf
