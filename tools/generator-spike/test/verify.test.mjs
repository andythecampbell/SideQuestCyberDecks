import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeBinaryStl, analyzeStepText, normalizeStep, normalizeStl, NORMALIZED_STEP_TIMESTAMP, STL_HEADER, verifyPart } from '../src/verify.mjs'

/** Builds a binary STL from triangles given as three [x, y, z] points. */
function stl(triangles, header = 'test') {
  const bytes = new Uint8Array(84 + triangles.length * 50)
  const view = new DataView(bytes.buffer)
  new TextEncoder().encodeInto(header.padEnd(80, ' ').slice(0, 80), bytes)
  view.setUint32(80, triangles.length, true)
  triangles.forEach((triangle, index) => {
    const base = 84 + index * 50
    triangle.forEach((point, pointIndex) =>
      point.forEach((value, axis) => view.setFloat32(base + 12 + pointIndex * 12 + axis * 4, value, true)),
    )
  })
  return bytes
}

const p = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }
// Outward-facing tetrahedron; volume 1/6.
const tetra = [
  [p.o, p.y, p.x],
  [p.o, p.x, p.z],
  [p.o, p.z, p.y],
  [p.x, p.y, p.z],
]
const shift = (triangles, dx) => triangles.map((triangle) => triangle.map(([x, y, z]) => [x + dx, y, z]))

test('a closed tetrahedron is one watertight body with genus zero', () => {
  const a = analyzeBinaryStl(stl(tetra))
  assert.equal(a.triangles, 4)
  assert.equal(a.watertight, true)
  assert.equal(a.boundaryEdges, 0)
  assert.equal(a.nonManifoldEdges, 0)
  assert.equal(a.inconsistentEdges, 0)
  assert.equal(a.degenerateTriangles, 0)
  assert.equal(a.bodies, 1)
  assert.equal(a.eulerCharacteristic, 2)
  assert.equal(a.genus, 0)
  assert.ok(Math.abs(a.signedVolumeMm3 - 1 / 6) < 1e-6)
  assert.deepEqual(a.boundsMm, [[0, 0, 0], [1, 1, 1]])
})

test('a removed triangle is an open mesh', () => {
  const a = analyzeBinaryStl(stl(tetra.slice(0, 3)))
  assert.equal(a.watertight, false)
  assert.equal(a.boundaryEdges, 3)
})

test('a flipped triangle is inconsistently oriented', () => {
  const flipped = [...tetra.slice(0, 3), [p.y, p.x, p.z]]
  const a = analyzeBinaryStl(stl(flipped))
  assert.equal(a.watertight, false)
  assert.ok(a.inconsistentEdges > 0)
})

test('an edge shared by four triangles is non-manifold', () => {
  const a = analyzeBinaryStl(stl([...tetra, ...tetra]))
  assert.equal(a.watertight, false)
  assert.ok(a.nonManifoldEdges > 0)
})

test('two separate tetrahedra are two bodies', () => {
  const a = analyzeBinaryStl(stl([...tetra, ...shift(tetra, 5)]))
  assert.equal(a.bodies, 2)
  assert.equal(a.watertight, true)
})

test('a degenerate triangle is counted and blocks watertightness', () => {
  const a = analyzeBinaryStl(stl([...tetra, [p.o, p.o, p.x]]))
  assert.equal(a.degenerateTriangles, 1)
  assert.equal(a.watertight, false)
})

test('an inside-out mesh is rejected by its negative volume', () => {
  const inverted = tetra.map(([a, b, c]) => [a, c, b])
  const a = analyzeBinaryStl(stl(inverted))
  assert.ok(a.signedVolumeMm3 < 0)
  assert.equal(a.watertight, false)
})

test('malformed binary STLs are diagnosed, not misread', () => {
  const bytes = stl(tetra)
  assert.throws(() => analyzeBinaryStl(bytes.slice(0, 100)), (error) => error.code === 'STL_MALFORMED')
  assert.throws(() => analyzeBinaryStl(new Uint8Array(10)), (error) => error.code === 'STL_MALFORMED')
})

test('normalizeStl stamps a fixed header and leaves geometry bytes alone', () => {
  const original = stl(tetra, 'STL Exported by Open CASCADE Technology')
  const normalized = normalizeStl(original)
  assert.equal(new TextDecoder().decode(normalized.slice(0, STL_HEADER.length)), STL_HEADER)
  assert.equal(normalized.length, original.length)
  assert.deepEqual(normalized.slice(84), original.slice(84))
  assert.doesNotMatch(new TextDecoder().decode(normalized.slice(0, 80)), /^solid/i)
  assert.deepEqual(normalizeStl(normalized), normalized, 'normalization is idempotent')
})

test('the normalized STL header states non-fabrication and is exactly 80 bytes', () => {
  assert.equal(STL_HEADER.length, 80)
  assert.match(STL_HEADER, /NON-FABRICATION/)
})

const stepText = (time = '2026-11-09T04:39:43', extra = '') =>
  `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Open CASCADE Model'),'2;1');
FILE_NAME('Open CASCADE Shape Model','${time}',('Author'),(
    'Open CASCADE'),'Open CASCADE STEP processor 8.0','Open CASCADE 8.0'
  ,'Unknown');
FILE_SCHEMA(('AP242'));
ENDSEC;
DATA;
#1 = MANIFOLD_SOLID_BREP('',#2);
#2 = CLOSED_SHELL('',(#3));
#4 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );
${extra}ENDSEC;
END-ISO-10303-21;
`
const utf8 = (text) => new TextEncoder().encode(text)

test('normalizeStep removes the wall-clock timestamp and labels the description', () => {
  const first = normalizeStep(utf8(stepText('2026-11-09T04:39:43')))
  const second = normalizeStep(utf8(stepText('2031-01-15T23:59:59')))
  assert.deepEqual(first, second)
  const text = new TextDecoder().decode(first)
  assert.ok(text.includes(`'${NORMALIZED_STEP_TIMESTAMP}'`))
  assert.doesNotMatch(text, /2026-11-09|2031-01-15/)
  assert.match(text, /FILE_DESCRIPTION\(\('NON-FABRICATION/)
  assert.deepEqual(normalizeStep(first), first, 'normalization is idempotent')
})

test('normalizeStep refuses a header it cannot normalize rather than passing a timestamp through', () => {
  for (const text of ['no header at all', stepText().replace('FILE_NAME', 'FILE_NOPE'), stepText().replace("'2026-11-09T04:39:43'", "'yesterday'")]) {
    assert.throws(() => normalizeStep(utf8(text)), (error) => error.code === 'STEP_HEADER_UNEXPECTED', text.slice(0, 20))
  }
})

test('analyzeStepText reads solids, shells and declared units from the exported text', () => {
  const a = analyzeStepText(normalizeStep(utf8(stepText())))
  assert.equal(a.manifoldSolidBreps, 1)
  assert.equal(a.closedShells, 1)
  assert.equal(a.openShells, 0)
  assert.equal(a.declaredLengthUnit, 'mm')
  assert.equal(a.timestamp, NORMALIZED_STEP_TIMESTAMP)
})

test('analyzeStepText distinguishes open shells, extra solids and non-millimetre units', () => {
  const open = analyzeStepText(utf8(stepText(undefined, "#5 = OPEN_SHELL('',(#6));\n")))
  assert.equal(open.openShells, 1)
  const two = analyzeStepText(utf8(stepText(undefined, "#5 = MANIFOLD_SOLID_BREP('',#6);\n")))
  assert.equal(two.manifoldSolidBreps, 2)
  const inch = analyzeStepText(utf8(stepText().replace('SI_UNIT(.MILLI.,.METRE.)', 'SI_UNIT($,.METRE.)')))
  assert.equal(inch.declaredLengthUnit, 'unknown')
})


const passing = () => ({
  expected: { dimensionsMm: [10, 20, 3], volumeMm3: 600, meshVolumeToleranceMm3: 1, throughFeatureCount: 2 },
  built: { solidCount: 1, valid: true, boundsMm: [[0, 0, 0], [10, 20, 3]], volumeMm3: 600 },
  stl: { watertight: true, bodies: 1, genus: 2, boundsMm: [[0, 0, 0], [10, 20, 3]], signedVolumeMm3: 600.5, boundaryEdges: 0, nonManifoldEdges: 0, inconsistentEdges: 0, degenerateTriangles: 0 },
  step: { manifoldSolidBreps: 1, closedShells: 1, openShells: 0, declaredLengthUnit: 'mm', timestamp: NORMALIZED_STEP_TIMESTAMP },
  stepReimport: { solidCount: 1, valid: true, boundsMm: [[0, 0, 0], [10, 20, 3]], volumeMm3: 600 },
})

test('verifyPart passes consistent measurements', () => {
  assert.deepEqual(verifyPart(passing()), [])
})

test('verifyPart names each failed check by path', () => {
  const cases = [
    [(i) => (i.built.solidCount = 2), 'geometry.solidCount'],
    [(i) => (i.built.valid = false), 'geometry.valid'],
    [(i) => (i.built.boundsMm[1][1] = 21), 'geometry.dimensionsMm'],
    [(i) => (i.built.boundsMm = [[1, 0, 0], [11, 20, 3]]), 'geometry.boundsMm'],
    [(i) => (i.built.volumeMm3 = 601), 'geometry.volumeMm3'],
    [(i) => (i.stl.watertight = false), 'geometry.stl.watertight'],
    [(i) => (i.stl.bodies = 2), 'geometry.stl.bodies'],
    [(i) => (i.stl.genus = 1), 'geometry.stl.genus'],
    [(i) => (i.stl.boundsMm[1][2] = 3.5), 'geometry.stl.dimensionsMm'],
    [(i) => (i.stl.signedVolumeMm3 = 590), 'geometry.stl.volumeMm3'],
    [(i) => (i.step.manifoldSolidBreps = 0), 'geometry.step.manifoldSolidBreps'],
    [(i) => (i.step.closedShells = 2), 'geometry.step.closedShells'],
    [(i) => (i.step.openShells = 1), 'geometry.step.openShells'],
    [(i) => (i.step.declaredLengthUnit = 'unknown'), 'geometry.step.declaredLengthUnit'],
    [(i) => (i.step.timestamp = '2026-11-09T04:39:43'), 'geometry.step.timestamp'],
    [(i) => (i.stepReimport.solidCount = 0), 'geometry.stepReimport.solidCount'],
    [(i) => (i.stepReimport.valid = false), 'geometry.stepReimport.valid'],
    [(i) => (i.stepReimport.boundsMm[1][0] = 9), 'geometry.stepReimport.dimensionsMm'],
    [(i) => (i.stepReimport.volumeMm3 = 1), 'geometry.stepReimport.volumeMm3'],
  ]
  for (const [mutate, path] of cases) {
    const input = passing()
    mutate(input)
    const paths = verifyPart(input).map((issue) => issue.path)
    assert.deepEqual(paths, [path], path)
  }
})
