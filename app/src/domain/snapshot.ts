// Snapshot codec: canonical serialization and version-gated parsing. Pure domain code.
import { z } from 'zod'
import { ConfigurationV2, POSES, migrateV1ToV2, resolve } from './articulated'
import { Configuration } from './configuration'
import { refKey, type ComponentDefinition, type EnclosureDefinition } from './catalog'

export const MAX_SNAPSHOT_BYTES = 1024 * 1024
export const SUPPORTED_SNAPSHOT_VERSIONS = [1, 2] as const

export interface SnapshotCatalog {
  components: ReadonlyMap<string, ComponentDefinition>
  enclosures: ReadonlyMap<string, EnclosureDefinition>
}

export type SnapshotParseResult =
  | { ok: true; configuration: ConfigurationV2; sourceVersion: 1 | 2; notices: string[] }
  | { ok: false; errors: string[] }

const reject = (...errors: string[]): SnapshotParseResult => ({ ok: false, errors })

/** Shared with the UI's pre-read size check, so both paths report the same message. */
export const snapshotTooLarge = (bytes: number) =>
  `File is too large: ${bytes} bytes; the limit is ${MAX_SNAPSHOT_BYTES} bytes.`

/** `placements[1].rotation` for a Zod issue path. */
const formatPath = (path: readonly PropertyKey[]) =>
  path.reduce<string>((out, key) => (typeof key === 'number' ? `${out}[${key}]` : out ? `${out}.${String(key)}` : String(key)), '')

/** Readable messages naming each problem, its location and what was expected. */
function describeIssues(error: z.ZodError, raw: unknown): string[] {
  return error.issues.flatMap(issue => {
    const path = formatPath(issue.path)
    if (issue.code === 'unrecognized_keys') return issue.keys.map(key => `Unknown key: ${path ? `${path}.${key}` : key}`)
    if (path === 'units') {
      const value = (raw as Record<string, unknown>).units
      return [`units: ${value === undefined ? 'missing' : `${JSON.stringify(value)} is not supported`}; snapshots are in millimeters ("mm") and units are never guessed or converted.`]
    }
    return [`${path ? `${path}: ` : ''}${issue.message}`]
  })
}

/** One message if the exact id@revision is absent. Revisions are matched exactly, never upgraded. */
function missingReference(where: string, ref: { id: string; revision: number }, entries: ReadonlyMap<string, { id: string; revision: number }>): string[] {
  if (entries.has(refKey(ref))) return []
  const revisions = [...entries.values()].filter(e => e.id === ref.id).map(e => e.revision).sort((a, b) => a - b)
  const detail = revisions.length
    ? `Available revisions of ${ref.id}: ${revisions.join(', ')}. Revisions are never upgraded automatically.`
    : `No revisions of ${ref.id} exist.`
  return [`${where}: ${refKey(ref)} is not in the catalog. ${detail}`]
}

function referenceErrors(configuration: ConfigurationV2, catalog: SnapshotCatalog): string[] {
  return [
    ...missingReference('enclosure', configuration.enclosure, catalog.enclosures),
    ...configuration.placements.flatMap((p, i) => missingReference(`placements[${i}].component`, p.component, catalog.components)),
  ]
}

/** Every supported pose must resolve to finite transforms. Pose never enters the stored design. */
function resolutionErrors(configuration: ConfigurationV2, catalog: SnapshotCatalog): string[] {
  const enclosure = catalog.enclosures.get(refKey(configuration.enclosure))!
  const finite = (t: { position: readonly number[]; rotation: readonly number[] }) =>
    t.position.every(Number.isFinite) && t.rotation.every(Number.isFinite)
  for (const pose of POSES) {
    try {
      const resolved = resolve(configuration, enclosure, catalog.components, pose)
      const body = (['base', 'lid'] as const).find(b => !finite(resolved.bodies[b]))
      if (body) return [`Cannot resolve in pose ${pose}: enclosure body ${body} has a non-finite world transform.`]
      const placement = resolved.placements.find(p => !finite(p))
      if (placement) return [`Cannot resolve in pose ${pose}: placement ${JSON.stringify(placement.id)} has a non-finite world transform.`]
    } catch (error) {
      return [`Cannot resolve in pose ${pose}: ${error instanceof Error ? error.message : String(error)}.`]
    }
  }
  return []
}

/** Exact JSON text for a number. JSON.stringify writes -0 as 0, which would lose a stored value. */
const canonicalNumber = (v: number) => (Object.is(v, -0) ? '-0' : JSON.stringify(v))

/** Keys in code-unit order, 2-space indent, all-number arrays on one line. Input key order never matters. */
function canonicalJson(value: unknown, indent = ''): string {
  if (typeof value === 'number') return canonicalNumber(value)
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  const inner = `${indent}  `
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.every(v => typeof v === 'number')) return `[${value.map(canonicalNumber).join(', ')}]`
    return `[\n${value.map(v => inner + canonicalJson(v, inner)).join(',\n')}\n${indent}]`
  }
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  if (entries.length === 0) return '{}'
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${canonicalJson(v, inner)}`).join(',\n')}\n${indent}}`
}

/**
 * The canonical bytes of a configuration. Throws if the configuration does not satisfy the strict
 * schema, so a value that could not be re-imported is never written out.
 */
export function serializeSnapshot(configuration: ConfigurationV2): string {
  return `${canonicalJson(ConfigurationV2.parse(configuration))}\n`
}

function decodeV2(raw: unknown): SnapshotParseResult {
  const parsed = ConfigurationV2.safeParse(raw)
  if (!parsed.success) return reject(...describeIssues(parsed.error, raw))
  return { ok: true, configuration: parsed.data, sourceVersion: 2, notices: [] }
}

/** The dropped-key report is a key-by-key comparison of the source against what the v1 schema kept. */
function droppedKeys(raw: unknown, kept: unknown, path: (string | number)[] = []): string[] {
  if (Array.isArray(raw)) return Array.isArray(kept) ? raw.flatMap((v, i) => droppedKeys(v, kept[i], [...path, i])) : []
  if (raw === null || typeof raw !== 'object' || kept === null || typeof kept !== 'object') return []
  return Object.keys(raw).flatMap(key => (Object.hasOwn(kept, key)
    ? droppedKeys((raw as Record<string, unknown>)[key], (kept as Record<string, unknown>)[key], [...path, key])
    : [formatPath([...path, key])]))
}

function decodeV1(raw: unknown): SnapshotParseResult {
  const parsed = Configuration.safeParse(raw)
  if (!parsed.success) return reject(...describeIssues(parsed.error, raw))
  let configuration: ConfigurationV2
  try {
    configuration = migrateV1ToV2(parsed.data)
  } catch (error) {
    return reject(...(error instanceof z.ZodError ? describeIssues(error, raw) : [error instanceof Error ? error.message : String(error)]))
  }
  const dropped = droppedKeys(raw, parsed.data)
  return {
    ok: true,
    configuration,
    sourceVersion: 1,
    notices: [
      'Migrated from schema version 1 to 2: every placement is attached to base and the world base is identity.',
      dropped.length ? `Dropped keys not in schema version 1: ${dropped.join(', ')}.` : 'No keys were dropped.',
    ],
  }
}

/** Parses untrusted text: a snapshot file or a stored value. Never throws; rejections are specific. */
export function parseSnapshot(text: string, catalog: SnapshotCatalog): SnapshotParseResult {
  const bytes = new TextEncoder().encode(text).length
  if (bytes > MAX_SNAPSHOT_BYTES) return reject(snapshotTooLarge(bytes))

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return reject(`File is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return reject('A snapshot must be a JSON object.')

  const version = (raw as Record<string, unknown>).schemaVersion
  const supported = `Supported versions: ${SUPPORTED_SNAPSHOT_VERSIONS.join(', ')}.`
  if (version === undefined) return reject(`Missing schemaVersion. ${supported}`)
  if (version !== 1 && version !== 2) return reject(`Unsupported schemaVersion ${JSON.stringify(version)}. ${supported}`)

  const decoded = version === 1 ? decodeV1(raw) : decodeV2(raw)
  if (!decoded.ok) return decoded
  const references = referenceErrors(decoded.configuration, catalog)
  if (references.length) return reject(...references)
  const unresolved = resolutionErrors(decoded.configuration, catalog)
  return unresolved.length ? reject(...unresolved) : decoded
}
