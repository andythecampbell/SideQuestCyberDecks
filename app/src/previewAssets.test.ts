import { test, expect } from 'vitest'
import { previewAsset } from './previewAssets'
test('preview mesh references are revision-specific and never infer an unknown revision',()=>{
 expect(previewAsset({id:'case-2800-preview',revision:1},'lid')).toBe('/previews/lid.glb')
 expect(previewAsset({id:'hoysond-7in-touch',revision:1})).toBe('/previews/display.glb')
 expect(previewAsset({id:'raspberry-pi-5',revision:2})).toBeUndefined()
 expect(previewAsset({id:'placeholder-box',revision:1},'lid')).toBeUndefined()
})
import { previewPolicy } from './previewAssets'
test('missing Pi, display and body mappings fail explicitly; only exact estimates allowed',()=>{
 for(const id of ['raspberry-pi-5','hoysond-7in-touch']) expect(previewPolicy({id,revision:2}).kind).toBe('missing')
 expect(previewPolicy({id:'case-2800-preview',revision:2},'base').kind).toBe('missing')
 expect(previewPolicy({id:'adafruit-mini-chiclet-keyboard',revision:1}).kind).toBe('estimate')
 expect(previewPolicy({id:'anker-10000-30w',revision:1}).kind).toBe('estimate')
 expect(previewPolicy({id:'anker-10000-30w',revision:2}).kind).toBe('missing')
})
