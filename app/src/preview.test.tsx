import {test,expect} from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PreviewControls, PartError } from './scene/PreviewControls'
import { articulatedDeck } from './articulatedFixture'
import { ConfigurationV2, resolve } from './domain/articulated'
import { catalog } from './catalog'
test('preview fixture resolves both poses with display on lid and others on base',()=>{
 const c=ConfigurationV2.parse(articulatedDeck)
 const e=catalog.enclosures.get('case-2800-preview@1')!
 expect(e).toBeDefined()
 expect(c.placements.find(p=>p.id==='display')?.attachment).toBe('lid')
 expect(c.placements.filter(p=>p.id!=='display').every(p=>p.attachment==='base')).toBe(true)
 expect(resolve(c,e,catalog.components,'OPEN').placements).toHaveLength(4)
 expect(resolve(c,e,catalog.components,'CLOSED').placements).toHaveLength(4)
})
test('native accessible pose controls disclose calibration and part-specific failure',()=>{
 const html=renderToStaticMarkup(<PreviewControls pose="OPEN" onPose={()=>{}} />)
 expect(html).toContain('aria-pressed="true"')
 expect(html).toContain('OPEN · 120°')
 expect(html).toContain('CLOSED · 210°')
 expect(html).toContain('UNRESOLVED')
 expect(html).toContain('not fit validated')
 const error=renderToStaticMarkup(<PartError name="Display" url="/previews/display.glb" />)
 expect(error).toContain('role="alert"')
 expect(error).toContain('Display')
 expect(error).toContain('/previews/display.glb')
})
import { App } from './App'
test('application presents articulated inspection and honest overlay/provenance notices',()=>{
 const html=renderToStaticMarkup(<App />)
 expect(html).toContain('UNRESOLVED')
 expect(html).toContain('Body-local')
 expect(html).toContain('overlays hidden')
 expect(html).toContain('license TODO')
})
import { rotate } from './domain/articulation'
test('illustrative local +Z display normal transforms inward in CLOSED; natural face unverified',()=>{
 const e=catalog.enclosures.get('case-2800-preview@1')!
 const display=resolve(articulatedDeck,e,catalog.components,'CLOSED').placements.find(p=>p.id==='display')!
 expect(rotate(display.rotation,[0,0,1])).toEqual([0,0,-1])
})
