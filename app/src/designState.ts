// Editable in-memory design state. Pose and selection are separate UI state and never live here.
// No persistence: edits stay in memory and are marked unsaved.
import type { ConfigurationV2 } from './domain/articulated'
import { editPlacement } from './domain/placementEdit'

export interface DesignState {
  configuration: ConfigurationV2
  /** True once any accepted edit changed a value since load. */
  unsaved: boolean
  /** Errors from the most recent rejected edit, cleared by the next accepted or no-op edit. */
  errors: string[]
}

export const initialDesign = (configuration: ConfigurationV2): DesignState =>
  ({ configuration, unsaved: false, errors: [] })

export function applyPlacementEdit(state: DesignState, placementId: string, patch: unknown, clock: () => string): DesignState {
  const result = editPlacement(state.configuration, placementId, patch, clock)
  if (result.errors.length) return { ...state, errors: result.errors }
  if (!result.changed) return state.errors.length ? { ...state, errors: [] } : state
  return { configuration: result.configuration, unsaved: true, errors: [] }
}
