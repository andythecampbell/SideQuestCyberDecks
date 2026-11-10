#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { EXIT, GeneratorError } from './errors.mjs'
import { generate } from './generate.mjs'

const USAGE = 'usage: node src/cli.mjs --request <request.json> --out <new-output-directory>'

function report(error) {
  const diagnostic =
    error instanceof GeneratorError
      ? error.toDiagnostic()
      : { status: 'refused-or-failed', code: 'INTERNAL', stage: 'unknown', message: String(error?.stack ?? error), issues: [], artifactsWritten: false }
  process.stderr.write(`${JSON.stringify(diagnostic, null, 2)}\n`)
  return error instanceof GeneratorError ? error.exitCode : EXIT.INTERNAL
}

async function main() {
  let values
  try {
    ;({ values } = parseArgs({ options: { request: { type: 'string' }, out: { type: 'string' } } }))
  } catch (cause) {
    throw new GeneratorError('USAGE', `${cause.message}. ${USAGE}`, { stage: 'usage' })
  }
  if (values.request === undefined || values.out === undefined) {
    throw new GeneratorError('USAGE', USAGE, { stage: 'usage' })
  }
  const summary = await generate({ requestPath: values.request, outDir: values.out })
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

try {
  await main()
} catch (error) {
  process.exitCode = report(error)
}
