const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fileNames}=require('./outputs.cjs');
test('Apache 2800 base/lid output names are stable and match the committed manifest URLs',()=>{
  const expected={base:'apache-2800-base.glb',lid:'apache-2800-lid.glb'};
  for(let i=0;i<2;i++){assert.equal(fileNames.base,expected.base);assert.equal(fileNames.lid,expected.lid)}
  const {assets}=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../app/public/previews/manifest.json'),'utf8'));
  for(const id of ['base','lid'])assert.equal(assets.find(a=>a.id===id).url,'/previews/'+fileNames[id]);
});
