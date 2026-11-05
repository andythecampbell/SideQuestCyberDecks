import { Component, Suspense, useMemo, type ReactNode } from 'react'
import { Html, useGLTF } from '@react-three/drei'
import type { Transform } from '../domain/articulation'
import { GLB_TO_DOMAIN } from '../domain/previewFrame'
import { PartError } from './PreviewControls'

class MeshBoundary extends Component<
  { name: string; url: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <Html center><PartError name={this.props.name} url={this.props.url} /></Html>
      : this.props.children
  }
}

function Asset({ url }: { url: string }) {
  const { scene } = useGLTF(url, false)
  const clone = useMemo(() => scene.clone(true), [scene])
  return (
    <group scale={GLB_TO_DOMAIN.scale} quaternion={GLB_TO_DOMAIN.rotation}>
      <primitive object={clone} />
    </group>
  )
}

interface Props {
  name: string
  url: string
  transform: Transform
  onSelect?: () => void
  selected?: boolean
}

export function PreviewMesh({ name, url, transform, onSelect, selected }: Props) {
  return (
    <group position={transform.position} quaternion={transform.rotation}
      onClick={onSelect ? e => { e.stopPropagation(); onSelect() } : undefined}>
      <MeshBoundary key={url} name={name} url={url}>
        <Suspense fallback={null}><Asset url={url} /></Suspense>
      </MeshBoundary>
      {selected && <Html position={[0, 0, 30]} center className="scene-label">{name} · body-local placement</Html>}
    </group>
  )
}
