import { useState } from 'react'
import { articulatedDeck } from './articulatedFixture'
import { browserStorage, createBrowserPersistence, type StorageLike } from './browserPersistence'
import { catalog } from './catalog'
import { applyPlacementEdit, committedDesign, initialDesign } from './designState'
import type { PlacementPatch } from './domain/placementEdit'
import { EMPTY_REPORT, type SnapshotReport } from './SnapshotPanel'
import { Workbench, type Pose } from './Workbench'

interface Props {
  initialPose?: Pose
  initialSelectedId?: string | null
  /** Browser storage to persist to, or null for none. Omitted uses localStorage. */
  storage?: StorageLike | null
  clock?: () => string
}

const systemClock = () => new Date().toISOString()

export function App({ initialPose = 'OPEN', initialSelectedId = null, storage, clock = systemClock }: Props = {}) {
  const [persistence] = useState(() => createBrowserPersistence(storage === undefined ? browserStorage() : storage, catalog))
  const [boot] = useState(() => persistence.load())
  // Editable design, kept separate from inspection pose and selection UI state.
  const [design, setDesign] = useState(() => initialDesign(boot.configuration ?? articulatedDeck))
  const [report, setReport] = useState<SnapshotReport>(() => ({ ...EMPTY_REPORT, storageNotices: boot.notices }))
  const [pose, setPose] = useState<Pose>(initialPose)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)

  const select = (id: string | null) => {
    setSelectedId(id)
    setDesign((d) => (d.errors.length ? { ...d, errors: [] } : d))
  }

  // Runs in the event handler, not a state updater: StrictMode must not repeat the clock or the write.
  const edit = (id: string, patch: PlacementPatch) => {
    const next = applyPlacementEdit(design, id, patch, clock)
    if (next.configuration === design.configuration) {
      setDesign(next)
      return
    }
    const result = persistence.save(next.configuration)
    setDesign(committedDesign(next.configuration, result.saved))
    setReport(r => ({ ...r, storageNotices: result.notices }))
  }

  return (
    <Workbench
      design={design}
      pose={pose}
      selectedId={selectedId}
      onPose={setPose}
      onSelect={select}
      onEdit={edit}
      report={report}
    />
  )
}
