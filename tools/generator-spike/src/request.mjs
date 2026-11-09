import { z } from 'zod'
import { GeneratorError, EXIT } from './errors.mjs'

export const REQUEST_SCHEMA = 'sidequest.generator-request/1'

const finiteNumber = z.number().refine(Number.isFinite, { message: 'must be a finite number' })

const syntheticInput = z.strictObject({
  class: z.literal('synthetic'),
  value: finiteNumber,
})

// Confidence and provenance fields are deliberately loose here. The structural
// layer accepts them so the fabrication guard can refuse them with a specific reason.
const physicalFactInput = z.strictObject({
  class: z.literal('physical-fact'),
  value: finiteNumber,
  confidence: z.unknown().optional(),
  source: z.unknown().optional(),
})

const designParameterInput = z.strictObject({
  class: z.literal('design-parameter'),
  value: finiteNumber,
  author: z.unknown().optional(),
  rationale: z.unknown().optional(),
  testEvidence: z.unknown().optional(),
})

const input = z.discriminatedUnion('class', [syntheticInput, physicalFactInput, designParameterInput])

const requestSchema = z.strictObject({
  schema: z.literal(REQUEST_SCHEMA),
  purpose: z.enum(['non-fabrication', 'fabrication']),
  units: z.literal('mm'),
  notice: z.string().optional(),
  template: z.strictObject({ id: z.string().min(1), revision: z.number().int().positive() }),
  inputs: z.record(z.string(), input),
})

function issuePath(issue) {
  return issue.path.join('.')
}

/** Structural parse only. Eligibility for fabrication is decided by the guard. */
export function parseRequest(raw) {
  const parsed = requestSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  const issues = parsed.error.issues.map((issue) => ({
    code: 'REQUEST_INVALID',
    path:
      issue.code === 'unrecognized_keys' && issue.path.length === 0
        ? issue.keys.join(',')
        : issuePath(issue),
    message: issue.message,
  }))
  throw new GeneratorError(
    'REQUEST_INVALID',
    `Request refused: ${issues.map((issue) => `${issue.path || '(root)'}: ${issue.message}`).join('; ')}`,
    { stage: 'request', issues, exitCode: EXIT.REFUSED },
  )
}
