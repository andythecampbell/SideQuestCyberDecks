import { Edges, Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { confidences, type ComponentDefinition } from '../domain/catalog'
import type { Placement } from '../domain/configuration'

const CATEGORY_COLORS: Record<ComponentDefinition['category'], string> = {
  compute: '#3f9b5a',
  display: '#3a6fb0',
  input: '#8a8f99',
  power: '#c08a2e',
  storage: '#7a5cb0',
  comms: '#b04a6a',
  accessory: '#5a9aa0',
}

interface Props {
  placement: Placement
  component: ComponentDefinition
  selected: boolean
  onSelect: () => void
}

/** Renders a catalog component as its envelope box plus mounting holes, ports, keep-outs, and active area. */
export function ComponentView({ placement, component, selected, onSelect }: Props) {
  const [sx, sy, sz] = component.envelope.size
  const hasEstimates = confidences(component).includes('estimate')

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect()
  }

  return (
    <group position={placement.position} quaternion={placement.rotation}>
      <mesh position={[sx / 2, sy / 2, sz / 2]} onClick={handleClick}>
        <boxGeometry args={[sx, sy, sz]} />
        <meshStandardMaterial
          color={CATEGORY_COLORS[component.category]}
          transparent
          opacity={selected ? 0.95 : 0.75}
          emissive={selected ? '#ffffff' : '#000000'}
          emissiveIntensity={selected ? 0.15 : 0}
        />
        <Edges color={selected ? '#ffffff' : hasEstimates ? '#e0a040' : '#d0d6de'} />
      </mesh>

      {component.activeArea && (() => {
        const [ax0, ay0] = component.activeArea.min
        const [ax1, ay1] = component.activeArea.max
        return (
          <mesh position={[(ax0 + ax1) / 2, (ay0 + ay1) / 2, sz + 0.2]} raycast={() => null}>
            <planeGeometry args={[ax1 - ax0, ay1 - ay0]} />
            <meshStandardMaterial color="#0b1a2e" />
          </mesh>
        )
      })()}

      {component.mountingHoles.map((h) => (
        // Cylinders are Y-aligned by default; rotate so the hole axis is Z.
        <mesh key={h.id} position={[h.position[0], h.position[1], sz / 2]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <cylinderGeometry args={[h.diameter / 2, h.diameter / 2, sz + 1, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}

      {component.ports.map((p) => (
        <mesh key={p.id} position={p.position} raycast={() => null}>
          <boxGeometry args={[4, 4, 4]} />
          <meshStandardMaterial color="#f0c040" emissive="#f0c040" emissiveIntensity={0.4} />
        </mesh>
      ))}

      {component.keepOuts.map((k) => {
        const size = [k.max[0] - k.min[0], k.max[1] - k.min[1], k.max[2] - k.min[2]] as const
        const center = [k.min[0] + size[0] / 2, k.min[1] + size[1] / 2, k.min[2] + size[2] / 2] as const
        return (
          <mesh key={k.id} position={center} raycast={() => null}>
            <boxGeometry args={size} />
            <meshBasicMaterial color="#d04040" transparent opacity={0.12} depthWrite={false} />
            <Edges color="#d04040" />
          </mesh>
        )
      })}

      {selected && (
        <Html position={[sx / 2, sy / 2, sz + 8]} center className="scene-label">
          {component.name}
        </Html>
      )}
    </group>
  )
}
