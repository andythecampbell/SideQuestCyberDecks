import { expect, test } from 'vitest'
import { compose, axisRotation, identity, Transform } from './articulation'
test('rigid composition rotates a local offset before translating', () => {
 const world = compose({ position: [10,20,30], rotation: axisRotation([0,0,1],90) }, { ...identity(), position: [2,0,0] })
 expect(world.position[0]).toBeCloseTo(10)
 expect(world.position[1]).toBeCloseTo(22)
 expect(world.position[2]).toBeCloseTo(30)
})
import { Articulated, ConfigurationV2, migrateV1ToV2, resolve } from './articulated'
import { deck001 } from '../fixtures'
import { catalog } from '../catalog'
const hinge = {schemaVersion:2,kind:'enclosure',id:'test-case',revision:1,name:'Test', sources:[{kind:'test',title:'Synthetic'}], calibration:'UNRESOLVED', assumptions:'Synthetic test only', bodies:{base:'base',lid:'lid'}, hinge:{pivot:[0,5,0],axis:[1,0,0],reference:identity(),referenceDriver:210,sign:1,sourceDrivers:{OPEN:120,CLOSED:210}}} as const
const config = () => ({...migrateV1ToV2(deck001),enclosure:{id:'test-case',revision:1},base:{position:[10,20,30],rotation:axisRotation([0,0,1],90)},placements:migrateV1ToV2(deck001).placements.map(p=>({...p,attachment:p.id==='display'?'lid' as const:'base' as const}))})
test('strict articulated schema rejects malformed frames and extra topology',()=>{
 expect(Articulated.safeParse(hinge).success).toBe(true)
 for(const axis of [[2,0,0],[0,0,0],[Infinity,0,0]]) expect(Articulated.safeParse({...hinge,hinge:{...hinge.hinge,axis}}).success).toBe(false)
 expect(Articulated.safeParse({...hinge,bodies:{...hinge.bodies,third:'x'}}).success).toBe(false)
 for(const rotation of [[0,0,0,2],[NaN,0,0,1]]) expect(Transform.safeParse({position:[0,0,0],rotation}).success).toBe(false)
 expect(Transform.safeParse({...identity(),scale:2}).success).toBe(false)
})
test('legacy adapter preserves all placements on identity base and roundtrips',()=>{
 const c=migrateV1ToV2(deck001)
 expect(c.base).toEqual(identity())
 expect(c.placements.map(({attachment,...p})=>{expect(attachment).toBe('base');return p})).toEqual(deck001.placements)
 expect(ConfigurationV2.parse(JSON.parse(JSON.stringify(c)))).toEqual(c)
 expect(c.createdAt).toBe(deck001.createdAt)
})
test('one hinge resolves attachments under nonidentity base without mutation or drift',()=>{
 const c=ConfigurationV2.parse(config()), e=Articulated.parse(hinge)
 const before=JSON.stringify(c)
 const closed=resolve(c,e,catalog.components,'CLOSED'), open=resolve(c,e,catalog.components,'OPEN')
 expect(open.bodies.base).toEqual(closed.bodies.base)
 for(const p of c.placements){
  const expected=compose(open.bodies[p.attachment],p)
  expect(open.placements.find(x=>x.id===p.id)).toMatchObject(expected)
  if(p.attachment==='base') expect(open.placements.find(x=>x.id===p.id)).toEqual(closed.placements.find(x=>x.id===p.id))
 }
 open.bodies.lid.position.forEach((v,i)=>expect(v).toBeCloseTo([5,20,35][i],10))
 for(let i=0;i<100;i++) expect(resolve(c,e,catalog.components,i%2?'OPEN':'CLOSED')).toEqual(i%2?open:closed)
 expect(JSON.stringify(c)).toBe(before)
})
test('rejects invalid references, attachments, versions, pose and unknown keys',()=>{
 const c=ConfigurationV2.parse(config()), e=Articulated.parse(hinge)
 expect(()=>resolve(c,e,new Map(),'OPEN')).toThrow(/component/)
 expect(()=>resolve({...c,enclosure:{id:'missing',revision:1}},e,catalog.components,'OPEN')).toThrow(/enclosure/)
 expect(()=>resolve(c,e,catalog.components,'BAD' as 'OPEN')).toThrow(/pose/)
 expect(()=>resolve({...c,enclosure:deck001.enclosure},catalog.enclosures.get('placeholder-box@1')!,catalog.components,'OPEN')).toThrow(/lid/)
 for(const invalid of [{...c,schemaVersion:3},{...c,pose:'OPEN'},{...c,placements:[c.placements[0],c.placements[0]]},{...c,placements:[{...c.placements[0],attachment:'other'}]},{...c,enclosure:{...c.enclosure,extra:1}}]) expect(ConfigurationV2.safeParse(invalid).success).toBe(false)
})
import { fromGLB } from './previewFrame'
test('standard GLB meters Y-up adapter inverts canonical conversion once',()=>{
 expect(fromGLB([0.12,0.03,-0.2])).toEqual([120,200,30])
 expect(fromGLB([1,0,0])).toEqual([1000,0,0])
})
import { parseCatalog } from '../catalog'
test('catalog admits a strict v2 enclosure alongside unchanged v1 entries',()=>{
 const parsed=parseCatalog({'articulated.json':hinge})
 expect(parsed.enclosures.get('test-case@1')).toEqual(hinge)
 expect(()=>parseCatalog({'bad.json':{...hinge,extra:1}})).toThrow(/bad.json/)
})
test('resolver rejects unsupported enclosure schemas instead of treating them as legacy boxes',()=>{
 const c=migrateV1ToV2(deck001)
 expect(()=>resolve(c,{...c.enclosure,schemaVersion:3},catalog.components,'OPEN')).toThrow(/schema/)
})
import { GLB_TO_DOMAIN } from './previewFrame'
import { rotate } from './articulation'
test('renderer asset quaternion and scale equal tested GLB point conversion',()=>{
 const p:[number,number,number]=[.12,.03,-.2]
 const actual=rotate(GLB_TO_DOMAIN.rotation,p).map(x=>x*GLB_TO_DOMAIN.scale)
 actual.forEach((x,i)=>expect(x).toBeCloseTo(fromGLB(p)[i],10))
})
test('nonidentity reference is applied before the pivot rotation and world base',()=>{
 const c=ConfigurationV2.parse(config())
 c.placements=[{...c.placements[3],position:[2,0,0],rotation:[0,0,0,1]}]
 const e=Articulated.parse({...hinge,hinge:{...hinge.hinge,reference:{position:[1,2,3],rotation:axisRotation([0,0,1],90)}}})
 const world=resolve(c,e,catalog.components,'OPEN').placements[0]
 world.position.forEach((v,i)=>expect(v).toBeCloseTo([2,21,31][i],10))
})
test('v2 catalog requires canonical ID and strict explicit source records',()=>{
 for(const patch of [{id:'Bad_ID'},{sources:undefined},{sources:[]},{sources:[{kind:'model',title:'case',extra:true}]}]) expect(Articulated.safeParse({...hinge,...patch}).success).toBe(false)
})
test('real legacy fixture resolves original world positions/quaternions without lid attachment',()=>{
 const c=migrateV1ToV2(deck001), e=catalog.enclosures.get('placeholder-box@1')!
 for(const pose of ['OPEN','CLOSED'] as const){const r=resolve(c,e,catalog.components,pose);expect(r.placements.map(({attachment,...p})=>{expect(attachment).toBe('base');return p})).toEqual(deck001.placements)}
})
test('actual case OPEN transform and finite strict placement validation',()=>{
 const c=ConfigurationV2.parse({...migrateV1ToV2(deck001),enclosure:{id:'case-2800-preview',revision:1}})
 const r=resolve(c,catalog.enclosures.get('case-2800-preview@1')!,catalog.components,'OPEN')
 r.bodies.lid.position.forEach((x,i)=>expect(x).toBeCloseTo([0,136.55,137.8][i],8))
 expect(r.bodies.lid.rotation[0]).toBeCloseTo(-Math.SQRT1_2,10)
 for(const p of [{...c.placements[0],extra:1},{...c.placements[0],position:[Infinity,0,0]}]) expect(ConfigurationV2.safeParse({...c,placements:[p]}).success).toBe(false)
})
