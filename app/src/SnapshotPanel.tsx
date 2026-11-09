import { useState, type ChangeEvent } from 'react'
import { EXPORT_FILE_NAME } from './snapshotFile'

export interface SnapshotReport {
  /** Latest browser-storage outcome worth reporting; replaced by the next committed change. */
  storageNotices: string[]
  /** Notices from the last accepted import, such as a migration report. */
  importNotices: string[]
  /** Specific reasons the last import was rejected; the loaded configuration did not change. */
  importErrors: string[]
}

export const EMPTY_REPORT: SnapshotReport = { storageNotices: [], importNotices: [], importErrors: [] }

interface Props {
  createdAt: string
  modifiedAt: string
  report: SnapshotReport
  onExport: () => void
  onImportFile: (file: File) => void
  onReset: () => void
}

export function SnapshotPanel({ createdAt, modifiedAt, report, onExport, onImportFile, onReset }: Props) {
  const [confirmingReset, setConfirmingReset] = useState(false)

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Clearing the picker lets the same file be chosen again after it is corrected or re-exported.
    event.target.value = ''
    if (file) onImportFile(file)
  }
  const activateReset = () => {
    if (confirmingReset) onReset()
    setConfirmingReset(c => !c)
  }

  return (
    <section className="snapshot" aria-label="Configuration file">
      <h2>Configuration file</h2>
      <dl>
        <dt>Created</dt>
        <dd data-field="createdAt">{createdAt}</dd>
        <dt>Modified</dt>
        <dd data-field="modifiedAt">{modifiedAt}</dd>
      </dl>
      <div className="snapshot-actions">
        <button type="button" onClick={onExport} title={`Download ${EXPORT_FILE_NAME}`}>Export file</button>
        <label className="snapshot-import">
          Import file
          <input type="file" accept=".json,application/json" onChange={chooseFile} />
        </label>
        <button type="button" onClick={activateReset}>{confirmingReset ? 'Confirm reset' : 'Reset to fixture'}</button>
        {confirmingReset && <button type="button" onClick={() => setConfirmingReset(false)}>Cancel</button>}
      </div>
      {report.storageNotices.map(notice => <p key={notice} role="alert" className="error">{notice}</p>)}
      {report.importErrors.length > 0 && (
        <div role="alert" className="error">
          Import rejected; configuration unchanged.
          <ul>{report.importErrors.map(error => <li key={error}>{error}</li>)}</ul>
        </div>
      )}
      {report.importNotices.map(notice => <p key={notice} role="status" className="muted">{notice}</p>)}
    </section>
  )
}
