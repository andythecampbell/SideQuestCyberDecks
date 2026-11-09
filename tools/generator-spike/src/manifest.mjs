import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STL_ANGULAR_DEFLECTION_RAD, STL_LINEAR_DEFLECTION_MM } from './synthetic-plate.mjs'
import { NORMALIZED_STEP_TIMESTAMP, STEP_PRODUCT_NAME, STL_HEADER, reportDimensions } from './verify.mjs'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const srcDir = fileURLToPath(new URL('.', import.meta.url))
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

/** Hashes every generator source file in a fixed order, so template or pipeline drift is visible. */
export function hashGeneratorSource() {
  const hash = createHash('sha256')
  for (const name of readdirSync(srcDir).filter((file) => file.endsWith('.mjs')).sort()) {
    hash.update(`${name}\0`)
    hash.update(readFileSync(join(srcDir, name)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export function hashFiles(files) {
  return Object.entries(files).map(([path, bytes]) => ({ path, sha256: sha256(bytes), bytes: bytes.length }))
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]))
  }
  return value
}

/** Stable key order and a fixed trailing newline make the manifest's own bytes reproducible. */
export function canonicalJson(value) {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`
}

const measured = ({ boundsMm, ...rest }) => ({ boundsMm, dimensionsMm: reportDimensions(boundsMm), ...rest })

/**
 * The record beside the artifact. Contains no timestamps or local paths. It records this
 * runtime's identity, so it may differ across machines even when the primary outputs do not.
 */
export function buildManifest({ request, template, built, expected, stl, step, stepReimport, versions, kernelMessages, outputs, generatorSourceSha256, stepOpenCascade }) {
  const { notice: _omittedFreeFormNotice, ...recordedRequest } = request
  return {
    manifestSchema: 'sidequest.generator-manifest/1',
    purpose: 'non-fabrication',
    fabricationEligible: false,
    label: 'NON-FABRICATION synthetic spike output. Never a Deck 001 part. Not for printing as a Deck 001 part.',
    request: recordedRequest,
    units: 'mm',
    generator: {
      name: packageJson.name,
      version: packageJson.version,
      template: { id: template.id, revision: template.revision },
      sourceSha256: generatorSourceSha256,
    },
    engine: { ...versions, openCascadeReported: stepOpenCascade },
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    exportSettings: {
      stl: {
        format: 'binary',
        linearDeflectionMm: STL_LINEAR_DEFLECTION_MM,
        angularDeflectionRad: STL_ANGULAR_DEFLECTION_RAD,
        header: STL_HEADER.trimEnd(),
        normalization: 'The 80-byte header OpenCascade writes is replaced with the fixed header above. Geometry bytes are unchanged.',
        unitsNote: 'Binary STL has no unit field. Coordinates are millimetres by this manifest and the project convention.',
      },
      step: {
        schema: 'AP242',
        writer: 'replicad blobSTEP (write.step.schema=5)',
        productName: STEP_PRODUCT_NAME,
        declaredLengthUnit: step.declaredLengthUnit,
        timestampNormalizedTo: NORMALIZED_STEP_TIMESTAMP,
        normalization: 'FILE_NAME timestamp set to the fixed value, the PRODUCT name replaced (OpenCascade appends a process-wide counter to it), and FILE_DESCRIPTION relabelled non-fabrication. Refused if any of the three is not recognized. Geometry entities are unchanged.',
      },
    },
    geometry: {
      units: 'mm',
      solidCount: built.solidCount,
      valid: built.valid,
      dimensionsMm: reportDimensions(built.boundsMm),
      boundsMm: built.boundsMm,
      volumeMm3: built.volumeMm3,
      expected,
      faces: built.faces,
      stages: built.stages,
      stl: measured({ ...stl, boundsMm: stl.boundsMm }),
      step,
      stepReimport,
    },
    outputs: outputs.map((output) => ({
      ...output,
      role: 'primary',
      format: output.path.endsWith('.stl') ? 'binary-stl' : 'step-ap242',
    })),
    diagnostics: {
      status: 'passed',
      refusals: [],
      kernelMessages,
    },
  }
}
