// Offline only. OCCT bakes occurrence placements; never apply them again.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {writeGLB}=require('./write-glb.cjs');
const {selectCaseGroups}=require('./groups.cjs');
const {fileNames}=require('./outputs.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'app/public/previews');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const options={linearUnit:'millimeter',linearDeflectionType:'absolute_value',linearDeflection:0.25,angularDeflection:0.5};
const sources=['2800 Case Assembly closed.step','2800 Case Assembly open.step','2800 Case Parts/2800 Case Assembly - Part 1.step','2800 Case Parts/2800 Case Assembly - Part 2.step','Hosyond 7in IPS LCD.step','Raspberry-Pi-5.step'];
const bounds=ps=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of ps) p.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v)});return {min,max,size:max.map((v,i)=>v-min[i])}};
(async()=>{
 const occt=await require('occt-import-js')(),validator=require('gltf-validator');
 const imported=new Map();
 function load(name){if(!imported.has(name)){const r=occt.ReadStepFile(fs.readFileSync(path.join(root,'assets',name)),options);if(!r.success)throw Error(name);imported.set(name,r)}return imported.get(name)}
 const manifest={status:'visual-only; calibration UNRESOLVED; not fit validated',tool:'occt-import-js@0.0.23; bounded GLB writer v1; gltf-validator@2.0.0-dev.3.10',options,sourceUnits:{declaration:'Onshape geometry contexts metre; Pi contexts millimetre (not derived units). OCCT output millimeter.',basis:'Operator declaration from recorded preparation evidence: sidequest-preparation/asset-feasibility.md and asset-inventory.json; not parsed by this converter'},canonicalToGLB:'(x,y,z)mm -> (x,z,-y)/1000 meters Y-up RH',loaderInverse:'rotation +90deg about X and uniform 1000 exactly once',sources:sources.map(p=>({path:'assets/'+p,sha256:hash(fs.readFileSync(path.join(root,'assets',p)))})),assets:[]};
 const groups=selectCaseGroups(load(sources[0]));
 manifest.closedHierarchy=load(sources[0]).root;
 for(const [id,source,component] of [['base',sources[0],false],['lid',sources[0],false],['display',sources[4],true],['pi',sources[5],true]]){
  const solids=groups[id] || load(source).meshes.map((mesh,index)=>({mesh,index,occurrence:null}));
  const meshes=solids.map(s=>s.mesh);
  // Pi XY natural orientation is provisional: long edge +X, board +Z.
  const orient=p=>id==='pi'?[-p[1],p[0],p[2]]:p;
  const original=meshes.flatMap(m=>{const p=m.attributes.position.array;return Array.from({length:p.length/3},(_,i)=>orient(p.slice(i*3,i*3+3)))});
  const rawBounds=bounds(original),offset=component?rawBounds.min:[0,0,0];
  const glb=writeGLB(meshes,orient,offset,bounds);
  const validation=await validator.validateBytes(new Uint8Array(glb));if(validation.issues.numErrors)throw Error(JSON.stringify(validation.issues));
  fs.writeFileSync(path.join(out,fileNames[id]),glb);
  manifest.assets.push({id,catalogKey:({base:'case-2800-preview@1/base',lid:'case-2800-preview@1/lid',display:'hoysond-7in-touch@1',pi:'raspberry-pi-5@1'})[id],url:'/previews/'+fileNames[id],source:'assets/'+source,selection:groups[id]?'verified CLOSED occurrence '+(id==='base'?'Part 1':'Part 2'):'all occurrences',solids:solids.map(({mesh,index,occurrence})=>({index,occurrence,name:mesh.name,bounds:bounds(Array.from({length:mesh.attributes.position.array.length/3},(_,i)=>mesh.attributes.position.array.slice(i*3,i*3+3)))})),rights:'uncleared',orientation:'unverified',sha256:hash(glb),bytes:glb.length,canonicalBounds:bounds(original.map(p=>p.map((v,i)=>v-offset[i]))),normalization:{orientation:id==='pi'?'(-y,x,z), provisional board orientation':'identity',subtractMin:offset},provenance:id==='display'?'Andy-authored, user confirmed; URL/license TODO':'GrabCAD; author/URL/license TODO, investigation deferred by user',validation:validation.issues});
 }
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest.assets.map(a=>({id:a.id,bytes:a.bytes,validation:a.validation})),null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
