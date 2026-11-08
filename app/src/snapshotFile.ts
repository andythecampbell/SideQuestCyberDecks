// Browser file boundary for snapshots. The domain codec does the validation.
import type { ConfigurationV2 } from './domain/articulated'
import { MAX_SNAPSHOT_BYTES, parseSnapshot, serializeSnapshot, snapshotTooLarge, type SnapshotCatalog, type SnapshotParseResult } from './domain/snapshot'

export const EXPORT_FILE_NAME = 'sidequest-configuration.json'

export function downloadSnapshot(configuration: ConfigurationV2): void {
  const url = URL.createObjectURL(new Blob([serializeSnapshot(configuration)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = EXPORT_FILE_NAME
  link.click()
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Rejects an oversized file from its size alone, so a huge file is never read into memory. */
export async function readSnapshotFile(file: File, catalog: SnapshotCatalog): Promise<SnapshotParseResult> {
  if (file.size > MAX_SNAPSHOT_BYTES) return { ok: false, errors: [snapshotTooLarge(file.size)] }
  let text: string
  try {
    text = await file.text()
  } catch (error) {
    return { ok: false, errors: [`The file could not be read: ${error instanceof Error ? error.message : String(error)}.`] }
  }
  return parseSnapshot(text, catalog)
}
