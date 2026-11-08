import { useState } from 'react'
import { articulatedDeck } from './articulatedFixture'
import { applyPlacementEdit, initialDesign } from './designState'
import { Workbench, type Pose } from './Workbench'

interface Props {
  initialPose?: Pose
  initialSelectedId?: string | null
}

const systemClock = () => new Date().toISOString()

export function App({ initialPose = 'OPEN', initialSelectedId = null }: Props = {}) {
  // Editable in-memory design, kept separate from inspection pose and selection UI state.
  const [design, setDesign] = useState(() => initialDesign(articulatedDeck))
  const [pose, setPose] = useState<Pose>(initialPose)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)

  const select = (id: string | null) => {
    setSelectedId(id)
    setDesign((d) => (d.errors.length ? { ...d, errors: [] } : d))
  }

  return (
    <Workbench
      design={design}
      pose={pose}
      selectedId={selectedId}
      onPose={setPose}
      onSelect={select}
      onEdit={(id, patch) => setDesign((d) => applyPlacementEdit(d, id, patch, systemClock))}
    />
  )
}
