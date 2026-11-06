import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test,expect } from 'vitest'
import manifest from '../public/previews/manifest.json'
import { previewAsset } from './previewAssets'
import { fromGLB } from './domain/previewFrame'
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex')
test('curated outputs and all immutable STEP inputs match their manifest hashes',()=>{
 for(const s of manifest.sources) expect(sha(readFileSync(new URL('../../'+s.path,import.meta.url)))).toBe(s.sha256)
 for(const a of manifest.assets){
  const glb=readFileSync(new URL('../public'+a.url,import.meta.url))
  expect(sha(glb)).toBe(a.sha256)
  expect(glb.readUInt32LE(0)).toBe(0x46546c67)
  expect(glb.readUInt32LE(8)).toBe(glb.length)
  expect(a.validation.numErrors).toBe(0)
  const [ref,body]=a.catalogKey.split('/'),[id,revision]=ref.split('@')
  expect(previewAsset({id,revision:Number(revision)},body as 'base'|'lid'|undefined)).toBe(a.url)
  const doc=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString())
  // Every vertex transformed through the loader boundary recovers canonical bounds.
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
  const binOffset=28+glb.readUInt32LE(12)
  for(const mesh of doc.meshes) for(const primitive of mesh.primitives){
   const ac=doc.accessors[primitive.attributes.POSITION],view=doc.bufferViews[ac.bufferView]
   for(let i=0;i<ac.count;i++){
    const p=fromGLB([0,1,2].map(k=>glb.readFloatLE(binOffset+view.byteOffset+i*12+k*4)) as [number,number,number])
    p.forEach((v,k)=>{min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v)})
   }
  }
  // Float32 storage precision only; not an engineering/calibration residual tolerance.
  min.forEach((v,k)=>expect(v).toBeCloseTo(a.canonicalBounds.min[k],3))
  max.forEach((v,k)=>expect(v).toBeCloseTo(a.canonicalBounds.max[k],3))
 }
})
import { previewAssets } from './previewAssets'
test('manifest and lookup agree both ways with explicit rights/orientation and bounded outputs',()=>{
 expect(Object.keys(previewAssets).sort()).toEqual(manifest.assets.map(a=>a.catalogKey).sort())
 expect(new Set(manifest.assets.map(a=>a.catalogKey)).size).toBe(manifest.assets.length)
 expect(manifest.assets.reduce((sum,a)=>sum+a.bytes,0)).toBeLessThan(6_000_000)
 for(const a of manifest.assets){expect(a.rights).toBe('uncleared');expect(a.orientation).toBe('unverified')}
 for(const [id,name,count] of [['base','Part 1',13],['lid','Part 2',8]] as const){
  const a=manifest.assets.find(a=>a.id===id)!
  expect(a.solids).toHaveLength(count)
  expect(a.solids.every(s=>s.occurrence===name && s.name==='' && s.bounds.min.every(Number.isFinite))).toBe(true)
 }
})
