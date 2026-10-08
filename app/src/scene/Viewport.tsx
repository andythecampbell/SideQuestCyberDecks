import { Canvas } from '@react-three/fiber'
import { Edges, GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei'
import type { Catalog } from '../catalog'
import { refKey, type EnclosureDefinition } from '../domain/catalog'
import type { Configuration } from '../domain/configuration'
import { ComponentView } from './ComponentView'

interface Props {
  catalog: Catalog
  configuration: Configuration
  selectedId: string | null
  onSelect: (placementId: string | null) => void
}

export function Viewport({ catalog, configuration, selectedId, onSelect }: Props) {
  const enclosure = catalog.enclosures.get(refKey(configuration.enclosure))
  const [ex, ey, ez] = enclosure?.interior.size ?? [200, 200, 100]

  return (
    // Z-up to match CAD conventions; see docs/CONVENTIONS.md.
    <Canvas
      camera={{ up: [0, 0, 1], position: [ex / 2 - 250, -320, 360], fov: 40, near: 1, far: 10000 }}
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

      {enclosure && <EnclosureView enclosure={enclosure} />}

      {configuration.placements.map((p) => {
        const component = catalog.components.get(refKey(p.component))
        if (!component) return null
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

      <OrbitControls makeDefault target={[ex / 2, ey / 2, ez / 3]} />
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.9} />
      </GizmoHelper>
    </Canvas>
  )
}

function EnclosureView({ enclosure }: { enclosure: EnclosureDefinition }) {
  const [x, y, z] = enclosure.interior.size
  return (
    <mesh position={[x / 2, y / 2, z / 2]} raycast={() => null}>
      <boxGeometry args={[x, y, z]} />
      <meshBasicMaterial color="#8fa3bf" transparent opacity={0.05} depthWrite={false} />
      <Edges color="#8fa3bf" />
    </mesh>
  )
}
