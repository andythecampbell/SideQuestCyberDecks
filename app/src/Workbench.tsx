import { catalog } from './catalog'
import { confidences, refKey } from './domain/catalog'
import type { PlacementPatch } from './domain/placementEdit'
import type { DesignState } from './designState'
import { PreviewControls } from './scene/PreviewControls'
import { Viewport } from './scene/Viewport'
import { NO_FIT_WARNING } from './noFitWarning'
import { PlacementPanel } from './PlacementPanel'

export type Pose = 'OPEN' | 'CLOSED'

export interface WorkbenchProps {
  design: DesignState
  pose: Pose
  selectedId: string | null
  onPose: (pose: Pose) => void
  /** Shared by the component list and the 3D meshes so both always show the same selection. */
  onSelect: (placementId: string | null) => void
  onEdit: (placementId: string, patch: PlacementPatch) => void
}

/** Controlled view: no hooks, all state is owned by App. */
export function Workbench({ design, pose, selectedId, onPose, onSelect, onEdit }: WorkbenchProps) {
  const { configuration } = design
  const selected = configuration.placements.find((p) => p.id === selectedId)
  const selectedComponent = selected && catalog.components.get(refKey(selected.component))

  return (
    <div className="layout">
      <aside className="panel">
        <aside className="no-fit-warning" role="note" aria-label="No-fit warning">
          <strong>Not validated.</strong> {NO_FIT_WARNING}
        </aside>
        <h1>SideQuest Decks</h1>
        <p className="muted">2800 articulated preview · mm, Z-up</p>
        {design.unsaved && <p role="status" className="unsaved">Unsaved · edits are in memory only; reloading discards them.</p>}

        <PreviewControls pose={pose} onPose={onPose} />
        <p className="muted">Body-local positions. Imported mesh overlays hidden: catalog holes, ports and keep-outs are unvalidated. Keyboard/power are estimated envelopes. Mesh bounds differ from estimated catalog envelopes; no scaling to fit. GrabCAD case/Pi and Andy display: source URLs/license TODO, deferred.</p>
        <h2>Components</h2>
        <ul className="parts">
          {configuration.placements.map((p) => {
            const c = catalog.components.get(refKey(p.component))
            if (!c) return <li key={p.id} className="error">Missing: {refKey(p.component)}</li>
            const estimates = confidences(c).filter((v) => v === 'estimate').length
            return (
              <li key={p.id} className={p.id === selectedId ? 'active' : ''}>
                <button type="button" aria-pressed={p.id === selectedId} onClick={() => onSelect(p.id)}>{c.name}</button>
                {estimates > 0 && <span className="badge">{estimates} est.</span>}
              </li>
            )
          })}
        </ul>

        {selectedComponent && selected && (
          <PlacementPanel
            key={selected.id}
            placement={selected}
            component={selectedComponent}
            enclosure={catalog.enclosures.get(refKey(configuration.enclosure))}
            enclosureRef={configuration.enclosure}
            errors={design.errors}
            onEdit={(patch) => onEdit(selected.id, patch)}
          />
        )}

        <footer className="muted">
          Illustrative preview only. No physical fit, clearance or fabrication validation.
        </footer>
      </aside>
      <main className="viewport">
        <Viewport pose={pose} catalog={catalog} configuration={configuration} selectedId={selectedId} onSelect={onSelect} />
      </main>
    </div>
  )
}
