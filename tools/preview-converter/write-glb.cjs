// Bounded deterministic writer: canonical mm/Z-up to GLB metres/Y-up.
function writeGLB(meshes, orient, offset, bounds) {
  const chunks=[],views=[],accessors=[],gmeshes=[],nodes=[],materials=[];let bytes=0;
  function accessor(array,type,count,componentType,extra={}){const b=Buffer.from(array.buffer,array.byteOffset,array.byteLength);const index=views.length;views.push({buffer:0,byteOffset:bytes,byteLength:b.length,target:type==='SCALAR'?34963:34962});chunks.push(b);bytes+=b.length;accessors.push({bufferView:index,componentType,count,type,...extra});return accessors.length-1}
  for(const m of meshes){const ps=[],ns=[],p=m.attributes.position.array,n=m.attributes.normal?.array;
   for(let i=0;i<p.length;i+=3){const q=orient(p.slice(i,i+3)).map((v,k)=>v-offset[k]);ps.push([q[0]/1000,q[2]/1000,-q[1]/1000]);if(n){const v=orient(n.slice(i,i+3));ns.push(v[0],v[2],-v[1])}}
   const b=bounds(ps),position=accessor(new Float32Array(ps.flat()),'VEC3',ps.length,5126,{min:b.min,max:b.max});
   const attributes={POSITION:position};if(n)attributes.NORMAL=accessor(new Float32Array(ns),'VEC3',ps.length,5126);
   const indices=accessor(new Uint32Array(m.index.array),'SCALAR',m.index.array.length,5125);
   const material=materials.length;materials.push({pbrMetallicRoughness:{baseColorFactor:[...(m.color||[.5,.5,.5]),1],metallicFactor:0,roughnessFactor:.8}});
   nodes.push({mesh:gmeshes.length,name:m.name});gmeshes.push({primitives:[{attributes,indices,material}]});
  }
  const doc={asset:{version:'2.0',generator:'SideQuest offline preview v1'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes:gmeshes,materials,buffers:[{byteLength:bytes}],bufferViews:views,accessors};
  let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const bin=Buffer.concat(chunks),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,jh,json,bh,bin]);
}
module.exports={writeGLB};
