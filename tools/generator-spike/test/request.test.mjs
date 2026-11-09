import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseRequest } from '../src/request.mjs'
import { GeneratorError } from '../src/errors.mjs'

const fixtureUrl = new URL('../fixtures/synthetic-plate.non-fabrication.request.json', import.meta.url)
const fixture = () => JSON.parse(readFileSync(fixtureUrl, 'utf8'))

const refused = (mutate) => {
  const request = fixture()
  mutate(request)
  try {
    parseRequest(request)
  } catch (error) {
    assert.ok(error instanceof GeneratorError, 'must be a GeneratorError')
    return error
  }
  assert.fail('expected the request to be refused')
}

test('accepts the synthetic non-fabrication fixture unchanged', () => {
  const parsed = parseRequest(fixture())
  assert.deepEqual(parsed, fixture())
})

test('requires an explicit purpose, schema, units and template', () => {
  for (const key of ['purpose', 'schema', 'units', 'template']) {
    const error = refused((request) => delete request[key])
    assert.equal(error.code, 'REQUEST_INVALID')
    assert.ok(error.issues.some((issue) => issue.path === key), `names ${key}: ${JSON.stringify(error.issues)}`)
  }
})

test('never guesses units', () => {
  const error = refused((request) => (request.units = 'inch'))
  assert.ok(error.issues.some((issue) => issue.path === 'units'))
})

test('refuses unknown top-level keys, so nothing can smuggle a fabrication label or placement', () => {
  for (const key of ['label', 'fabrication', 'placements', 'hinge', 'meshBounds', 'viewport']) {
    const error = refused((request) => (request[key] = 'fabrication'))
    assert.equal(error.code, 'REQUEST_INVALID')
    assert.match(error.message, new RegExp(key))
  }
})

test('refuses extra keys inside an input', () => {
  const error = refused((request) => (request.inputs.plateSizeX.meshBounds = [0, 0, 0]))
  assert.ok(error.issues.some((issue) => issue.path.startsWith('inputs.plateSizeX')))
})

test('refuses non-finite and non-numeric values', () => {
  for (const value of [null, 'wide', Number.POSITIVE_INFINITY, Number.NaN]) {
    const error = refused((request) => (request.inputs.plateSizeX.value = value))
    assert.ok(error.issues.some((issue) => issue.path === 'inputs.plateSizeX.value'), `${value}`)
  }
})

test('refuses an input with no class rather than guessing one', () => {
  const error = refused((request) => delete request.inputs.plateSizeX.class)
  assert.ok(error.issues.some((issue) => issue.path.startsWith('inputs.plateSizeX')))
})

test('refuses a purpose outside the two declared values', () => {
  for (const purpose of ['preview', 'FABRICATION', '']) {
    const error = refused((request) => (request.purpose = purpose))
    assert.ok(error.issues.some((issue) => issue.path === 'purpose'), purpose)
  }
})

test('reports every problem at once, with a path for each', () => {
  const error = refused((request) => {
    request.units = 'inch'
    request.purpose = 'preview'
  })
  assert.deepEqual(error.issues.map((issue) => issue.path).sort(), ['purpose', 'units'])
})
