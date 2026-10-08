import { useState } from 'react'
import { catalog } from './catalog'
import { confidences, refKey } from './domain/catalog'
import { deck001 } from './fixtures'
import { Viewport } from './scene/Viewport'

export function App() {
  const [configuration] = useState(deck001)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = configuration.placements.find((p) => p.id === selectedId)
  const selectedComponent = selected && catalog.components.get(refKey(selected.component))

  return (
    <div className="layout">
      <aside className="panel">
        <h1>SideQuest Decks</h1>
        <p className="muted">Deck 001 · placeholder enclosure · mm, Z-up</p>

        <h2>Components</h2>
        <ul className="parts">
          {configuration.placements.map((p) => {
            const c = catalog.components.get(refKey(p.component))
            if (!c) return <li key={p.id} className="error">Missing: {refKey(p.component)}</li>
            const estimates = confidences(c).filter((v) => v === 'estimate').length
            return (
              <li key={p.id} className={p.id === selectedId ? 'active' : ''} onClick={() => setSelectedId(p.id)}>
                <span>{c.name}</span>
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
              <dt>Position</dt>
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
          Orange edges: contains estimated values. Red volumes: keep-outs. Yellow: ports.
        </footer>
      </aside>
      <main className="viewport">
        <Viewport catalog={catalog} configuration={configuration} selectedId={selectedId} onSelect={setSelectedId} />
      </main>
    </div>
  )
}
