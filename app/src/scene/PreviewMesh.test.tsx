import { expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

const { htmlPortal } = vi.hoisted(() => ({ htmlPortal: vi.fn() }))
vi.mock('@react-three/drei', () => ({
  useGLTF: () => { throw new Promise(() => {}) },
  Html: ({ children }: { children: ReactNode }) => {
    htmlPortal()
    return <div>{children}</div>
  },
}))
import { PreviewMesh } from './PreviewMesh'

test('pending GLTF stays in the R3F tree without mounting an Html fallback portal in either pose', () => {
  for (const rotation of [[0, 0, 0, 1], [1, 0, 0, 0]] as [number, number, number, number][]) {
    htmlPortal.mockClear()
    const markup = renderToStaticMarkup(<PreviewMesh name="base" url="/previews/apache-2800-base.glb"
      transform={{ position: [0, 0, 0], rotation }} />)
    expect(markup).toContain('<group')
    expect(htmlPortal).not.toHaveBeenCalled()
    expect(markup).not.toContain('Loading base')
  }
})
