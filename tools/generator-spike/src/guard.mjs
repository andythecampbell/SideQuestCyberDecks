import { lstatSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { GeneratorError, EXIT } from './errors.mjs'
import { TEMPLATES } from './synthetic-plate.mjs'

const MEASUREMENT_RECORD = /^evidence\/measurements\/[a-z0-9][a-z0-9-]*-\d{4}-\d{2}-\d{2}\.md$/
const PLACEHOLDER = /^(todo|tbd|unknown|n\/?a|none|\?+|placeholder|-+)$/i

const usableText = (value) => typeof value === 'string' && value.trim() !== '' && !PLACEHOLDER.test(value.trim())

/**
 * True only for a regular, non-empty file under the canonical repository root.
 * Policy: the repository root is canonicalized, and no cited path component below it may
 * be a symlink. The final real path is checked for containment as a second defence.
 */
function repoFileExists(repoRoot, relativePath) {
  try {
    const root = realpathSync(repoRoot)
    const lexical = resolve(root, relativePath)
    const lexicalRelative = relative(root, lexical)
    if (lexicalRelative === '..' || lexicalRelative.startsWith(`..${sep}`) || isAbsolute(lexicalRelative)) return false
    let current = root
    for (const component of lexicalRelative.split(sep)) {
      current = resolve(current, component)
      if (lstatSync(current).isSymbolicLink()) return false
    }
    const canonical = realpathSync(lexical)
    const canonicalRelative = relative(root, canonical)
    if (canonicalRelative === '..' || canonicalRelative.startsWith(`..${sep}`) || isAbsolute(canonicalRelative)) return false
    const stat = lstatSync(canonical)
    return stat.isFile() && stat.size > 0
  } catch {
    return false
  }
}

const isRepoRelative = (path) =>
  typeof path === 'string' && path !== '' && !path.startsWith('/') && !path.split(/[\\/]/).includes('..')

function checkDatasheetUri(uri, repoRoot) {
  if (!usableText(uri)) return 'SOURCE_NOT_DURABLE'
  if (uri.startsWith('evidence/datasheets/') && isRepoRelative(uri)) {
    return repoFileExists(repoRoot, uri) ? null : 'SOURCE_NOT_FOUND'
  }
  try {
    const url = new URL(uri)
    return url.protocol === 'https:' && url.hostname !== '' ? null : 'SOURCE_NOT_DURABLE'
  } catch {
    return 'SOURCE_NOT_DURABLE'
  }
}

function checkSource(input, path, repoRoot, issues) {
  const { confidence, source } = input
  const report = (code, message) => issues.push({ code, path: `${path}.source`, message })
  if (source === null || typeof source !== 'object' || Array.isArray(source) || typeof source.kind !== 'string') {
    report('SOURCE_MISSING', 'A consumed physical fact must cite a durable source.')
    return
  }
  if ((confidence === 'measured') !== (source.kind === 'measurement-record') || (confidence === 'datasheet') !== (source.kind === 'datasheet')) {
    report('SOURCE_KIND_MISMATCH', `Confidence "${confidence}" cannot cite a "${source.kind}" source.`)
    return
  }
  if (source.kind === 'measurement-record') {
    if (source.record === undefined || source.record === null || source.record === '') {
      report('SOURCE_MISSING', 'A measured fact must name its record under evidence/measurements/.')
    } else if (!MEASUREMENT_RECORD.test(source.record) || !isRepoRelative(source.record)) {
      report('SOURCE_NOT_DURABLE', `"${source.record}" is not an evidence/measurements/<subject>-<feature>-<YYYY-MM-DD>.md record.`)
    } else if (!repoFileExists(repoRoot, source.record)) {
      report('SOURCE_NOT_FOUND', `Measurement record "${source.record}" was not found in the repository.`)
    }
    return
  }
  if (!usableText(source.title) || !usableText(source.locator)) {
    report('SOURCE_NOT_DURABLE', 'A datasheet source needs a title and a locator (revision, page, figure or table).')
    return
  }
  const uriCode = checkDatasheetUri(source.uri, repoRoot)
  if (uriCode !== null) {
    report(uriCode, `Datasheet uri "${source.uri}" must be https or an existing evidence/datasheets/ file.`)
  }
}

function checkPhysicalFact(input, path, repoRoot, issues) {
  const { confidence } = input
  if (confidence === 'estimate') {
    issues.push({ code: 'ESTIMATE_NOT_ALLOWED', path: `${path}.confidence`, message: 'Estimates must never drive a generated part.' })
    return
  }
  if (confidence !== 'measured' && confidence !== 'datasheet') {
    issues.push({ code: 'CONFIDENCE_NOT_QUALIFYING', path: `${path}.confidence`, message: 'Confidence must be "measured" or "datasheet".' })
    return
  }
  checkSource(input, path, repoRoot, issues)
}

function checkTestEvidence(evidence, path, repoRoot, issues) {
  const report = (code, message) => issues.push({ code, path: `${path}.testEvidence`, message })
  const required = 'State test evidence as { status: "recorded", reference } or { status: "not-applicable", reason }.'
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) {
    report('TEST_EVIDENCE_REQUIRED', required)
  } else if (evidence.status === 'not-applicable') {
    if (!usableText(evidence.reason)) report('TEST_EVIDENCE_REQUIRED', 'A "not-applicable" status needs a reason.')
  } else if (evidence.status === 'recorded') {
    if (!usableText(evidence.reference)) report('TEST_EVIDENCE_REQUIRED', 'A "recorded" status needs a reference.')
    else if (!isRepoRelative(evidence.reference) || !evidence.reference.startsWith('evidence/') || !repoFileExists(repoRoot, evidence.reference)) {
      report('TEST_EVIDENCE_NOT_FOUND', `Test evidence "${evidence.reference}" was not found under evidence/.`)
    }
  } else {
    report('TEST_EVIDENCE_REQUIRED', required)
  }
}

function checkDesignParameter(input, path, repoRoot, issues) {
  for (const field of ['author', 'rationale']) {
    if (!usableText(input[field])) {
      issues.push({ code: 'DESIGN_PARAMETER_INCOMPLETE', path: `${path}.${field}`, message: `A design parameter must record its ${field}.` })
    }
  }
  checkTestEvidence(input.testEvidence, path, repoRoot, issues)
}

function checkBinding(request, issues) {
  const template = TEMPLATES[request.template.id]
  if (template === undefined) {
    issues.push({ code: 'TEMPLATE_UNKNOWN', path: 'template.id', message: `Unknown template "${request.template.id}".` })
    return null
  }
  if (template.revision !== request.template.revision) {
    issues.push({ code: 'TEMPLATE_REVISION_UNKNOWN', path: 'template.revision', message: `Template "${template.id}" has no revision ${request.template.revision}.` })
    return null
  }
  const declared = new Set(template.inputs)
  for (const name of Object.keys(request.inputs).filter((key) => !declared.has(key))) {
    issues.push({ code: 'INPUT_NOT_CONSUMED', path: `inputs.${name}`, message: `Template "${template.id}" does not consume "${name}".` })
  }
  for (const name of template.inputs.filter((key) => request.inputs[key] === undefined)) {
    issues.push({ code: 'INPUT_MISSING', path: `inputs.${name}`, message: `Template "${template.id}" requires "${name}".` })
  }
  return template
}

function fail(code, issues) {
  const summary = issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')
  const label = code === 'FABRICATION_REFUSED' ? 'Fabrication refused' : 'Request refused'
  throw new GeneratorError(code, `${label}: ${summary}`, { stage: 'guard', issues, exitCode: EXIT.REFUSED })
}

/**
 * Decides whether a structurally valid request may reach the kernel. Touches no kernel
 * and writes nothing. Every consumed input is examined, so a refusal lists every problem.
 */
export function checkRequest(request, { repoRoot }) {
  const issues = []
  const template = checkBinding(request, issues)
  if (template === null) fail('REQUEST_INVALID', issues)

  const consumed = template.inputs.filter((name) => request.inputs[name] !== undefined)

  if (request.purpose === 'non-fabrication') {
    for (const name of consumed) {
      if (request.inputs[name].class !== 'synthetic') {
        issues.push({
          code: 'NON_FABRICATION_REQUIRES_SYNTHETIC',
          path: `inputs.${name}`,
          message: 'A non-fabrication request carries only explicitly synthetic values, so no physical fact enters the spike.',
        })
      }
    }
    if (issues.length > 0) fail('REQUEST_INVALID', issues)
    return template
  }

  for (const name of consumed) {
    const input = request.inputs[name]
    const path = `inputs.${name}`
    if (input.class === 'synthetic') {
      issues.push({ code: 'SYNTHETIC_IN_FABRICATION', path, message: 'A synthetic value cannot be consumed by a fabrication request.' })
    } else if (input.class === 'physical-fact') {
      checkPhysicalFact(input, path, repoRoot, issues)
    } else {
      checkDesignParameter(input, path, repoRoot, issues)
    }
  }
  if (!template.purposes.includes('fabrication')) {
    issues.push({
      code: 'TEMPLATE_NOT_FABRICATION_CAPABLE',
      path: 'template',
      message: `Template "${template.id}" is non-fabrication only and can never produce an artifact labelled for fabrication.`,
    })
  }
  if (issues.length > 0) fail('FABRICATION_REFUSED', issues)
  return template
}
