import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { EXIT, GeneratorError } from './errors.mjs'
import { checkRequest } from './guard.mjs'
import { parseRequest } from './request.mjs'

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

/** Runs the pipeline. Nothing is written until every check has passed. */
export async function generate({ requestPath, repoRoot = REPO_ROOT }) {
  const request = parseRequest(readRequestFile(requestPath))
  checkRequest(request, { repoRoot })
  throw new GeneratorError('NOT_IMPLEMENTED', 'Geometry generation is not implemented yet.', { stage: 'build', exitCode: EXIT.INTERNAL })
}
