import { Canvas } from '@react-three/fiber'
import { Html, Edges, GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei'
import type { Catalog } from '../catalog'
import { refKey, type EnclosureDefinition } from '../domain/catalog'
import type { Configuration } from '../domain/configuration'
import { ComponentView } from './ComponentView'
import { resolve, migrateV1ToV2, type ConfigurationV2 } from '../domain/articulated'
import { PreviewMesh } from './PreviewMesh'
import { previewPolicy } from '../previewAssets'

interface Props {
  catalog: Catalog
  configuration: Configuration | ConfigurationV2
  pose?: 'OPEN' | 'CLOSED'
  selectedId: string | null
  onSelect: (placementId: string | null) => void
}

export function Viewport({ catalog, configuration, selectedId, onSelect, pose = 'OPEN' }: Props) {
  let enclosure: EnclosureDefinition | undefined
  let resolved: ReturnType<typeof resolve> | undefined
  let diagnostic: string | undefined
  try {
    enclosure = catalog.enclosures.get(refKey(configuration.enclosure))
    if (!enclosure) throw Error(`Missing enclosure ${refKey(configuration.enclosure)}`)
    resolved = resolve(configuration.schemaVersion === 1 ? migrateV1ToV2(configuration) : configuration,
      enclosure, catalog.components, pose)
  } catch (error) { diagnostic = error instanceof Error ? error.message : String(error) }
  const articulated = enclosure?.schemaVersion === 2
  const [ex, ey, ez] = enclosure?.schemaVersion === 1 ? enclosure.interior.size : [0, 0, 100]

  return (
    // Z-up to match CAD conventions; see docs/CONVENTIONS.md.
    <Canvas
      camera={{ up: [0, 0, 1], position: articulated ? [550, -650, 480] : [ex / 2 - 250, -320, 360], fov: 40, near: 1, far: 10000 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#15181d']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[200, -300, 500]} intensity={1.6} />
      <directionalLight position={[-300, 200, 200]} intensity={0.5} />

      {/* drei's Grid lies in XZ; rotate it into the XY ground plane. 10 mm cells, 50 mm sections. */}
      <Grid
        rotation={[Math.PI / 2, 0, 0]}
        cellSize={10}
        sectionSize={50}
        cellColor="#2a2f37"
        sectionColor="#3d4552"
        infiniteGrid
        fadeDistance={2000}
      />

      {diagnostic && <Html center><p role="alert">Preview configuration error: {diagnostic}</p></Html>}
      {enclosure?.schemaVersion === 1 && <EnclosureView enclosure={enclosure} />}
      {articulated && resolved && (['base', 'lid'] as const).map(body => {
        const asset = previewPolicy(configuration.enclosure, body)
        return asset.kind === 'mesh'
          ? <PreviewMesh key={body} name={body} url={asset.url} transform={resolved.bodies[body]} />
          : <Html key={body} center><p role="alert">Missing preview mapping: {refKey(configuration.enclosure)}/{body}</p></Html>
      })}

      {resolved?.placements.map((p) => {
        const component = catalog.components.get(refKey(p.component))
        if (!component) return null
        const asset = articulated ? previewPolicy(p.component) : {kind:'estimate' as const}
        if (asset.kind === 'missing') return <Html key={p.id} position={p.position}><p role="alert">{component.name}: {asset.diagnostic}</p></Html>
        if (asset.kind === 'mesh') return (
          <PreviewMesh key={p.id} name={component.name} url={asset.url} transform={p}
            selected={p.id === selectedId} onSelect={() => onSelect(p.id)} />
        )
        return (
          <ComponentView
            key={p.id}
            placement={p}
            component={component}
            selected={p.id === selectedId}
            onSelect={() => onSelect(p.id)}
          />
        )
      })}

      <OrbitControls makeDefault target={articulated ? [0, 40, 60] : [ex / 2, ey / 2, ez / 3]} />
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.9} />
      </GizmoHelper>
    </Canvas>
  )
}

function EnclosureView({ enclosure }: { enclosure: Extract<EnclosureDefinition, { schemaVersion: 1 }> }) {
  const [x, y, z] = enclosure.interior.size
  return (
    <mesh position={[x / 2, y / 2, z / 2]} raycast={() => null}>
      <boxGeometry args={[x, y, z]} />
      <meshBasicMaterial color="#8fa3bf" transparent opacity={0.05} depthWrite={false} />
      <Edges color="#8fa3bf" />
    </mesh>
  )
}
