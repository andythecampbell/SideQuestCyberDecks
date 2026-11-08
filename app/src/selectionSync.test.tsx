import { describe, expect, test, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Workbench, type WorkbenchProps } from './Workbench'
import { Viewport } from './scene/Viewport'
import { PreviewControls } from './scene/PreviewControls'
import { PreviewMesh } from './scene/PreviewMesh'
import { ComponentView } from './scene/ComponentView'
import { initialDesign, applyPlacementEdit } from './designState'
import { articulatedDeck } from './articulatedFixture'
import { catalog } from './catalog'
import { EMPTY_REPORT } from './SnapshotPanel'

type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>
/** Collects host and component elements without invoking child components. */
function elements(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach(n => elements(n, out))
  else if (isValidElement(node)) {
    out.push(node as El)
    elements((node as El).props.children, out)
  }
  return out
}

const props = (over: Partial<WorkbenchProps> = {}): WorkbenchProps => ({
  design: initialDesign(articulatedDeck), pose: 'OPEN', selectedId: null,
  onPose: vi.fn(), onSelect: vi.fn(), onEdit: vi.fn(), report: EMPTY_REPORT, onExport: vi.fn(), onImportFile: vi.fn(), onReset: vi.fn(), ...over,
})
const listButtons = (tree: El[]) => tree.filter(e => e.type === 'button' && 'aria-pressed' in e.props)

describe('list and mesh selection stay in sync', () => {
  test('list and viewport receive the same selection and the same selection callback', () => {
    for (const selectedId of [null, 'display', 'pi']) {
      const p = props({ selectedId })
      const tree = elements(Workbench(p))
      const viewport = tree.find(e => e.type === Viewport)!
      expect(viewport.props.selectedId).toBe(selectedId)
      expect(viewport.props.onSelect).toBe(p.onSelect)
      const pressed = listButtons(tree).map(b => b.props['aria-pressed'])
      expect(pressed).toEqual(articulatedDeck.placements.map(x => x.id === selectedId))
    }
  })

  test('clicking a list entry selects that placement through the shared callback', () => {
    const p = props()
    listButtons(elements(Workbench(p))).forEach(b => (b.props.onClick as () => void)())
    expect((p.onSelect as ReturnType<typeof vi.fn>).mock.calls).toEqual(articulatedDeck.placements.map(x => [x.id]))
  })

  test.each(['OPEN', 'CLOSED'] as const)('clicking a mesh in %s selects its placement and highlights only the selected one', pose => {
    const onSelect = vi.fn()
    const tree = elements(Viewport({ catalog, configuration: articulatedDeck, pose, selectedId: 'display', onSelect }))
    const meshes = tree.filter(e => (e.type === PreviewMesh || e.type === ComponentView) && e.props.onSelect)
    expect(meshes).toHaveLength(articulatedDeck.placements.length)
    meshes.forEach(m => (m.props.onSelect as () => void)())
    expect(onSelect.mock.calls.map(c => c[0]).sort()).toEqual(articulatedDeck.placements.map(x => x.id).sort())
    expect(meshes.filter(m => m.props.selected).map(m => m.key)).toEqual(['display'])
  })

  test('edits from the panel are routed to the selected placement', () => {
    const p = props({ selectedId: 'pi' })
    const panel = elements(Workbench(p)).find(e => typeof e.props.onEdit === 'function')!
    ;(panel.props.onEdit as (x: unknown) => void)({ position: [1, 2, 3] })
    expect(p.onEdit).toHaveBeenCalledWith('pi', { position: [1, 2, 3] })
  })
})

describe('pose is UI state separate from the design', () => {
  test('pose controls only call onPose and never touch the design', () => {
    const edited = applyPlacementEdit(initialDesign(articulatedDeck), 'display', { position: [1, 2, 3] }, () => '2026-11-08T12:00:00.000Z')
    const snapshot = structuredClone(edited)
    let pose: 'OPEN' | 'CLOSED' = 'OPEN'
    const onEdit = vi.fn()
    for (let i = 0; i < 25; i++) {
      const p = props({ design: edited, pose, selectedId: 'display', onEdit, onPose: next => { pose = next } })
      const controls = elements(Workbench(p)).find(e => e.type === PreviewControls)!
      ;(controls.props.onPose as (x: 'OPEN' | 'CLOSED') => void)(pose === 'OPEN' ? 'CLOSED' : 'OPEN')
      renderToStaticMarkup(Workbench(p))
    }
    expect(onEdit).not.toHaveBeenCalled()
    expect(edited).toEqual(snapshot)
    expect(edited.configuration.modifiedAt).toBe(snapshot.configuration.modifiedAt)
  })

  test('the unsaved marker reflects only accepted edits', () => {
    expect(renderToStaticMarkup(Workbench(props()))).not.toContain('Unsaved')
    const edited = applyPlacementEdit(initialDesign(articulatedDeck), 'pi', { position: [0, 0, 0] }, () => '2026-11-08T12:00:00.000Z')
    for (const pose of ['OPEN', 'CLOSED'] as const) expect(renderToStaticMarkup(Workbench(props({ design: edited, pose })))).toContain('Unsaved')
  })
})
