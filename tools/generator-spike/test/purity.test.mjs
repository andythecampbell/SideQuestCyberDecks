import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SYNTHETIC, readFixture } from './support.mjs'

const src = fileURLToPath(new URL('../src/', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const ALLOWED_PACKAGES = new Set(['replicad', 'replicad-opencascadejs', 'zod'])
const entry = join(src, 'cli.mjs')

const importsOf = (text) => [
  ...[...text.matchAll(/\bfrom\s+'([^']+)'/g)].map((m) => m[1]),
  ...[...text.matchAll(/\bimport\s*\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]),
  ...[...text.matchAll(/\bimport\s+'([^']+)'/g)].map((m) => m[1]),
  ...[...text.matchAll(/\brequire(?:\.resolve)?\s*\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]),
]

/** Follows the generator's import graph from the CLI entry point. */
function generatorGraph() {
  const seen = new Set()
  const external = new Set()
  const visit = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.')) visit(resolve(dirname(file), specifier))
      else external.add(specifier)
    }
  }
  visit(entry)
  return { files: [...seen], external: [...external] }
}

test('the generator imports only its own modules, the pinned engine, zod and node builtins', () => {
  const { files, external } = generatorGraph()
  for (const file of files) assert.ok(file.startsWith(src), `${relative(repoRoot, file)} is outside the generator`)
  for (const specifier of external) {
    const packageName = specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
    assert.ok(specifier.startsWith('node:') || ALLOWED_PACKAGES.has(packageName), `unexpected import ${specifier}`)
  }
  assert.ok(files.length >= 7, `graph walked ${files.length} files`)
})

test('every generator source file is on the graph, so nothing bypasses the check', () => {
  const onGraph = new Set(generatorGraph().files)
  for (const name of readdirSync(src).filter((file) => file.endsWith('.mjs'))) {
    assert.ok(onGraph.has(join(src, name)), `${name} is not reachable from cli.mjs`)
  }
})

test('the generator path never references preview, catalog, snapshot or placement data', () => {
  const forbidden = /previews?\b|catalog|snapshots?\b|articulat|\bhinge\b|viewport|meshBounds?|mesh[- ]manifest|\bplacements?\b|\.glb\b|deck[- ]?001\/|app\/src|app\/public/i
  const { files } = generatorGraph()
  for (const file of files) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
      assert.doesNotMatch(code, forbidden, `${relative(repoRoot, file)}:${index + 1}: ${line.trim()}`)
    })
  }
})

test('the fixture shares no numeric value with catalog, snapshot or fixture-placement data', () => {
  const numbers = new Set()
  const collect = (value) => {
    if (typeof value === 'number') numbers.add(value)
    else if (Array.isArray(value)) value.forEach(collect)
    else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  const walk = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.json')) collect(JSON.parse(readFileSync(path, 'utf8')))
    }
  }
  for (const directory of ['catalog', 'snapshots', 'app/src/domain/__fixtures__']) walk(join(repoRoot, directory))
  collect(JSON.parse(readFileSync(join(repoRoot, 'app/public/previews/manifest.json'), 'utf8')))
  assert.ok(numbers.size > 50, `collected ${numbers.size} reference values`)
  const collisions = Object.entries(readFixture(SYNTHETIC).inputs).filter(([, input]) => numbers.has(input.value))
  assert.deepEqual(collisions, [], 'fixture values must be deliberately unlike Deck 001 data')
})

test('the fixture declares itself non-fabrication and synthetic throughout', () => {
  const request = readFixture(SYNTHETIC)
  assert.equal(request.purpose, 'non-fabrication')
  assert.match(request.notice, /Deck 001/)
  for (const input of Object.values(request.inputs)) assert.equal(input.class, 'synthetic')
})
