interface Props {
  pose: 'OPEN' | 'CLOSED'
  onPose: (pose: 'OPEN' | 'CLOSED') => void
}
export function PreviewControls({ pose, onPose }: Props) {
  return (
    <section aria-label="Inspection pose">
      <p role="status">UNRESOLVED calibration · illustrative placement / not fit validated. Component natural orientation is unverified.</p>
      <div>{(['OPEN', 'CLOSED'] as const).map(p => (
        <button key={p} type="button" aria-pressed={pose === p} onClick={() => onPose(p)}>
          {p} · {p === 'OPEN' ? 120 : 210}°
        </button>
      ))}</div>
      <p className="muted">
        Inspection only. Assumed CLOSED reference, sign +1, candidate +X hinge.
        Driver delta 90°; observed export delta 90.75770394990006°. Datums and mapping await approval.
      </p>
    </section>
  )
}
export function PartError({ name, url }: { name: string; url: string }) {
  return <p role="alert" className="error">{name} mesh unavailable: {url}. Restore this preview asset and reload. No substitute geometry is shown.</p>
}
