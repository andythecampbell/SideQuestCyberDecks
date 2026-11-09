import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const cliPath = fileURLToPath(new URL('../src/cli.mjs', import.meta.url))
export const fixturePath = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))
export const SYNTHETIC = 'synthetic-plate.non-fabrication.request.json'
export const REJECTED = 'rejected-fabrication.estimate.request.json'

export const readFixture = (name) => JSON.parse(readFileSync(fixturePath(name), 'utf8'))
export const scratch = (label = 'run') => mkdtempSync(join(tmpdir(), `generator-spike-${label}-`))

/** Writes a request to a scratch file, for tests that mutate a fixture. */
export function writeRequest(directory, request, name = 'request.json') {
  const path = join(directory, name)
  writeFileSync(path, typeof request === 'string' ? request : JSON.stringify(request))
  return path
}

export function runCli(args, env = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 120000,
  })
  if (result.error) throw result.error
  return result
}

export function listTree(directory) {
  return readdirSync(directory, { recursive: true }).sort()
}
