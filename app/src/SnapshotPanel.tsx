export interface SnapshotReport {
  /** Latest browser-storage outcome worth reporting; replaced by the next committed change. */
  storageNotices: string[]
  /** Notices from the last accepted import, such as a migration report. */
  importNotices: string[]
  /** Specific reasons the last import was rejected; the loaded configuration did not change. */
  importErrors: string[]
}

export const EMPTY_REPORT: SnapshotReport = { storageNotices: [], importNotices: [], importErrors: [] }

export function SnapshotPanel({ report }: { report: SnapshotReport }) {
  return (
    <section className="snapshot" aria-label="Configuration file">
      <h2>Configuration file</h2>
      {report.storageNotices.map(notice => <p key={notice} role="alert" className="error">{notice}</p>)}
    </section>
  )
}
