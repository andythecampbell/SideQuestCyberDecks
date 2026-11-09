import { test, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
vi.mock('@react-three/fiber',()=>({Canvas:({children}:{children:ReactNode})=><div data-canvas="retained">{children}</div>}))
vi.mock('@react-three/drei',()=>({Html:({children}:{children:ReactNode})=><div>{children}</div>,Edges:()=>null,GizmoHelper:()=>null,GizmoViewport:()=>null,Grid:()=>null,OrbitControls:()=>null}))
vi.mock('./PreviewMesh',()=>({PreviewMesh:({url}:{url:string})=><span>{url}</span>}))
vi.mock('./ComponentView',()=>({ComponentView:()=> <span>estimate envelope</span>}))
import { Viewport } from './Viewport'
import { catalog } from '../catalog'
import { articulatedDeck } from '../articulatedFixture'
const render=(configuration=articulatedDeck, data=catalog)=>renderToStaticMarkup(<Viewport configuration={configuration} catalog={data} selectedId={null} onSelect={()=>{}} />)
test('bad references and invalid configuration show useful diagnostics and retain scene',()=>{
 for(const c of [ {...articulatedDeck,enclosure:{id:'missing',revision:1}}, {...articulatedDeck,placements:articulatedDeck.placements.map(p=>({...p,component:{id:'missing',revision:1}}))}, {...articulatedDeck,base:{...articulatedDeck.base,position:[Infinity,0,0]}} ]){
  const html=render(c as typeof articulatedDeck)
  expect(html).toContain('data-canvas="retained"');expect(html).toContain('role="alert"');expect(html).toContain('Preview configuration error:')
 }
})
test('missing Pi/display mappings keep other meshes; body mapping never sends undefined URL',()=>{
 for(const id of ['raspberry-pi-5','hosyond-7in-touch']){
  const components=new Map(catalog.components), part=components.get(id+'@1')!
  components.set(id+'@2',{...part,revision:2})
  const config={...articulatedDeck,placements:articulatedDeck.placements.map(p=>p.component.id===id?{...p,component:{id,revision:2}}:p)}
  const html=render(config,{...catalog,components})
  expect(html).toContain(`Missing preview mapping: ${id}@2`);expect(html).toContain('/previews/apache-2800-base.glb');expect(html).toContain('/previews/apache-2800-lid.glb')
 }
 const enclosure=catalog.enclosures.get('case-2800-preview@1')!, enclosures=new Map(catalog.enclosures)
 enclosures.set('case-2800-preview@2',{...enclosure,revision:2})
 const html=render({...articulatedDeck,enclosure:{id:enclosure.id,revision:2}},{...catalog,enclosures})
 expect(html).toContain('Missing preview mapping: case-2800-preview@2/base')
 expect(html).toContain('Missing preview mapping: case-2800-preview@2/lid')
 expect(html).not.toContain('undefined')
})
