import { useState } from 'react'
import { catalog } from './catalog'
import { confidences, refKey } from './domain/catalog'
import { articulatedDeck } from './articulatedFixture'
import { PreviewControls } from './scene/PreviewControls'
import { Viewport } from './scene/Viewport'

export function App() {
  const [configuration] = useState(articulatedDeck)
  const [pose, setPose] = useState<'OPEN' | 'CLOSED'>('OPEN')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = configuration.placements.find((p) => p.id === selectedId)
  const selectedComponent = selected && catalog.components.get(refKey(selected.component))

  return (
    <div className="layout">
      <aside className="panel">
        <h1>SideQuest Decks</h1>
        <p className="muted">2800 articulated preview · mm, Z-up</p>

        <PreviewControls pose={pose} onPose={setPose} />
        <p className="muted">Body-local positions. Imported mesh overlays hidden: catalog holes, ports and keep-outs are unvalidated. Keyboard/power are estimated envelopes. Mesh bounds differ from estimated catalog envelopes; no scaling to fit. GrabCAD case/Pi and Andy display: source URLs/license TODO, deferred.</p>
        <h2>Components</h2>
        <ul className="parts">
          {configuration.placements.map((p) => {
            const c = catalog.components.get(refKey(p.component))
            if (!c) return <li key={p.id} className="error">Missing: {refKey(p.component)}</li>
            const estimates = confidences(c).filter((v) => v === 'estimate').length
            return (
              <li key={p.id} className={p.id === selectedId ? 'active' : ''}>
                <button type="button" aria-pressed={p.id===selectedId} onClick={()=>setSelectedId(p.id)}>{c.name}</button>
                {estimates > 0 && <span className="badge">{estimates} est.</span>}
              </li>
            )
          })}
        </ul>

        {selectedComponent && selected && (
          <section className="details">
            <h2>{selectedComponent.name}</h2>
            <dl>
              <dt>Catalog</dt>
              <dd>{refKey(selectedComponent)}</dd>
              <dt>Envelope</dt>
              <dd>
                {selectedComponent.envelope.size.join(' × ')} mm ({selectedComponent.envelope.confidence})
              </dd>
              <dt>Body-local position ({selected.attachment}) · mm</dt>
              <dd>{selected.position.join(', ')}</dd>
              <dt>Holes / ports / keep-outs</dt>
              <dd>
                {selectedComponent.mountingHoles.length} / {selectedComponent.ports.length} /{' '}
                {selectedComponent.keepOuts.length}
              </dd>
            </dl>
            {selectedComponent.notes && <p className="muted">{selectedComponent.notes}</p>}
          </section>
        )}

        <footer className="muted">
          Illustrative preview only. No physical fit, clearance or fabrication validation.
        </footer>
      </aside>
      <main className="viewport">
        <Viewport pose={pose} catalog={catalog} configuration={configuration} selectedId={selectedId} onSelect={setSelectedId} />
      </main>
    </div>
  )
}
