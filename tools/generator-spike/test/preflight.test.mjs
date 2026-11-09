import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expectedGeometry, preflight } from '../src/synthetic-plate.mjs'
import { SYNTHETIC, readFixture } from './support.mjs'

const values = (mutate = () => {}) => {
  const out = Object.fromEntries(Object.entries(readFixture(SYNTHETIC).inputs).map(([key, input]) => [key, input.value]))
  mutate(out)
  return out
}

const issuesFor = (mutate) => preflight(values(mutate))
const has = (issues, code, path) =>
  assert.ok(issues.some((issue) => issue.code === code && issue.path === path), `${code} at ${path} in ${JSON.stringify(issues)}`)

test('the fixture is geometrically feasible', () => {
  assert.deepEqual(preflight(values()), [])
})

test('requires positive plate dimensions', () => {
  for (const key of ['plateSizeX', 'plateSizeY', 'plateThickness', 'cornerRadius', 'pocketDepth', 'throughCutSizeX', 'pocketSizeY', 'hole2Diameter']) {
    has(issuesFor((v) => (v[key] = 0)), 'DIMENSION_NOT_POSITIVE', `inputs.${key}`)
  }
})

test('refuses a corner radius that cannot fit the plate', () => {
  has(issuesFor((v) => (v.cornerRadius = v.plateSizeY / 2)), 'CORNER_RADIUS_TOO_LARGE', 'inputs.cornerRadius')
})

test('refuses a pocket as deep as the plate, because that would be a through-cut', () => {
  has(issuesFor((v) => (v.pocketDepth = v.plateThickness)), 'POCKET_TOO_DEEP', 'inputs.pocketDepth')
})

test('refuses a feature that leaves the plate', () => {
  has(issuesFor((v) => (v.throughCutMinX = v.plateSizeX - 1)), 'FEATURE_OUTSIDE_PLATE', 'inputs.throughCutMinX')
  has(issuesFor((v) => (v.hole1Y = 0.5)), 'FEATURE_OUTSIDE_PLATE', 'inputs.hole1Y')
  has(issuesFor((v) => (v.pocketMinY = -1)), 'FEATURE_OUTSIDE_PLATE', 'inputs.pocketMinY')
})

test('refuses a feature inside a rounded corner region', () => {
  has(issuesFor((v) => { v.hole1X = 3; v.hole1Y = 3 }), 'FEATURE_IN_CORNER', 'inputs.hole1X')
})

test('refuses overlapping features', () => {
  has(issuesFor((v) => { v.hole1X = v.throughCutMinX + 1; v.hole1Y = v.throughCutMinY + 1 }), 'FEATURES_OVERLAP', 'inputs.hole1X')
  has(issuesFor((v) => { v.pocketMinX = v.throughCutMinX; v.pocketMinY = v.throughCutMinY }), 'FEATURES_OVERLAP', 'inputs.pocketMinX')
})

test('expected geometry is derived only from the explicit inputs', () => {
  const expected = expectedGeometry(values())
  assert.deepEqual(expected.dimensionsMm, [73.5, 41.25, 6.125])
  assert.equal(expected.throughFeatureCount, 4)
  assert.equal(expected.units, 'mm')
  const v = values()
  const analytic =
    (v.plateSizeX * v.plateSizeY - (4 - Math.PI) * v.cornerRadius ** 2) * v.plateThickness -
    v.throughCutSizeX * v.throughCutSizeY * v.plateThickness -
    v.pocketSizeX * v.pocketSizeY * v.pocketDepth -
    Math.PI * ((v.hole1Diameter / 2) ** 2 + (v.hole2Diameter / 2) ** 2 + (v.hole3Diameter / 2) ** 2) * v.plateThickness
  assert.equal(expected.volumeMm3, analytic)
  assert.ok(expected.meshVolumeToleranceMm3 > 0)
})
