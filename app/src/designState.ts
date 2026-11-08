// Editable design state. Pose and selection are separate UI state and never live here.
// The app persists committed changes; `unsaved` means the current design has not reached storage.
import type { ConfigurationV2 } from './domain/articulated'
import { editPlacement } from './domain/placementEdit'

export interface DesignState {
  configuration: ConfigurationV2
  /** True when the current design has changes that are not in browser storage. */
  unsaved: boolean
  /** Errors from the most recent rejected edit, cleared by the next accepted or no-op edit. */
  errors: string[]
}

export const initialDesign = (configuration: ConfigurationV2): DesignState =>
  ({ configuration, unsaved: false, errors: [] })

/** State after a committed change (edit or import); `saved` says whether it reached browser storage. */
export const committedDesign = (configuration: ConfigurationV2, saved: boolean): DesignState =>
  ({ configuration, unsaved: !saved, errors: [] })

export function applyPlacementEdit(state: DesignState, placementId: string, patch: unknown, clock: () => string): DesignState {
  const result = editPlacement(state.configuration, placementId, patch, clock)
  if (result.errors.length) return { ...state, errors: result.errors }
  if (!result.changed) return state.errors.length ? { ...state, errors: [] } : state
  return { configuration: result.configuration, unsaved: true, errors: [] }
}
