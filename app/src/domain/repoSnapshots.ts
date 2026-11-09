// Validation of committed configuration snapshots under snapshots/. Pure domain code: the caller
// reads the files. A label is the honest statement of what a snapshot is. Every field below is a
// literal on purpose: stronger wording needs a deliberate schema change backed by physical evidence.
import { z } from 'zod'
import { refKey } from './catalog'
import { parseSnapshot, serializeSnapshot, type SnapshotCatalog } from './snapshot'

const INDEX_FILE = 'index.json'

const RepoSnapshotLabel = z.object({
  file: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*\.json$/, 'file names are lowercase kebab-case .json'),
  deck: z.string().min(1),
  status: z.literal('illustrative'),
  calibration: z.literal('uncalibrated'),
  authoritative: z.literal(false),
  asBuilt: z.literal(false),
  notes: z.string().min(1),
  unverifiedIdentities: z.array(z.object({ ref: z.string().min(1), note: z.string().min(1) }).strict()),
}).strict()
type RepoSnapshotLabel = z.infer<typeof RepoSnapshotLabel>

export const RepoSnapshotIndex = z.object({ snapshots: z.array(RepoSnapshotLabel).min(1) }).strict()

function validateSnapshot(label: RepoSnapshotLabel, text: string, catalog: SnapshotCatalog): string[] {
  const name = label.file
  const problems = name.includes(label.status) ? [] : [`${name}: file name must include "${label.status}" while its status is ${label.status}`]

  const parsed = parseSnapshot(text, catalog)
  if (!parsed.ok) return [...problems, ...parsed.errors.map(error => `${name}: ${error}`)]
  if (parsed.sourceVersion !== 2) problems.push(`${name}: a committed snapshot must be schema version 2, not a file that needs migrating`)
  if (serializeSnapshot(parsed.configuration) !== text) problems.push(`${name}: not canonical; commit the exact bytes the app exports`)

  for (const placement of parsed.configuration.placements) {
    const key = refKey(placement.component)
    const unverified = label.unverifiedIdentities.some(entry => entry.ref === key)
    if (catalog.components.get(key)?.category === 'display' && !unverified) {
      problems.push(`${name}: display ${key} must be listed as unverified in unverifiedIdentities until physical evidence confirms its identity and spelling`)
    }
  }
  return problems
}

/** All problems with the committed snapshots; empty means every snapshot and its label are acceptable. */
export function validateRepoSnapshots(files: Readonly<Record<string, string>>, catalog: SnapshotCatalog): string[] {
  const indexText = files[INDEX_FILE]
  if (indexText === undefined) return [`${INDEX_FILE}: missing`]

  let raw: unknown
  try {
    raw = JSON.parse(indexText)
  } catch (error) {
    return [`${INDEX_FILE}: not valid JSON: ${error instanceof Error ? error.message : String(error)}`]
  }
  const index = RepoSnapshotIndex.safeParse(raw)
  if (!index.success) return index.error.issues.map(issue => `${INDEX_FILE}: ${issue.path.join('.')}: ${issue.message}`)

  const errors: string[] = []
  const listed = new Set<string>()
  for (const label of index.data.snapshots) {
    if (listed.has(label.file)) {
      errors.push(`${label.file}: duplicate entry in ${INDEX_FILE}`)
      continue
    }
    listed.add(label.file)
    const text = files[label.file]
    if (text === undefined) errors.push(`${label.file}: listed in ${INDEX_FILE} but missing`)
    else errors.push(...validateSnapshot(label, text, catalog))
  }
  for (const name of Object.keys(files)) {
    if (name !== INDEX_FILE && !listed.has(name)) errors.push(`${name}: not listed in ${INDEX_FILE}`)
  }
  return errors
}
