import { EXIT, GeneratorError } from './errors.mjs'

/** STEP's FILE_NAME timestamp is replaced with this fixed value. */
export const NORMALIZED_STEP_TIMESTAMP = '1970-01-01T00:00:00'

/** Fixed binary STL header. Exactly 80 bytes; never starts with "solid". */
export const STL_HEADER = 'NON-FABRICATION SIDEQUEST SPIKE synthetic-plate r1 units=mm no-timestamp'.padEnd(80, ' ')

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
        lowest[axis] = Math.min(lowest[axis], value)
        highest[axis] = Math.max(highest[axis], value)
      })
    }
    const ids = [a, b, c].map(([x, y, z]) => vertexId(x, y, z))
    for (const id of ids) {
      if (parents[id] === undefined) parents[id] = id
    }
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[2] === ids[0]) {
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

/**
 * Removes the wall-clock timestamp from a STEP header and labels the file as non-fabrication.
 * Refuses to pass through a header it cannot recognize, so a timestamp can never survive silently.
 */
export function normalizeStep(bytes) {
  const text = decoder.decode(bytes)
  const headerEnd = text.indexOf('ENDSEC;')
  if (headerEnd < 0 || !text.startsWith('ISO-10303-21;')) {
    throw malformed('STEP_HEADER_UNEXPECTED', 'STEP output has no recognizable ISO-10303-21 header.')
  }
  const header = text.slice(0, headerEnd)
  const timestamps = [...header.matchAll(FILE_NAME_TIMESTAMP)]
  if (timestamps.length !== 1) {
    throw malformed('STEP_HEADER_UNEXPECTED', `Expected exactly one FILE_NAME timestamp, found ${timestamps.length}.`)
  }
  if (!FILE_DESCRIPTION_VALUE.test(header)) {
    throw malformed('STEP_HEADER_UNEXPECTED', 'STEP header has no FILE_DESCRIPTION value to label.')
  }
  const normalizedHeader = header
    .replace(FILE_NAME_TIMESTAMP, `$1${NORMALIZED_STEP_TIMESTAMP}$3`)
    .replace(FILE_DESCRIPTION_VALUE, `$1${STEP_DESCRIPTION}$3`)
  return new TextEncoder().encode(normalizedHeader + text.slice(headerEnd))
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
