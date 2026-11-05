// OCCT mesh names are empty in this source; occurrence names are authoritative.
function selectCaseGroups(result) {
  const nodes=[];
  function visit(node){nodes.push(node);for(const child of node.children || []) visit(child)}
  visit(result.root);
  const assemblies=nodes.filter(n=>n.name==='2800 Case Assembly');
  if(assemblies.length!==1) throw Error('Expected one 2800 Case Assembly occurrence');
  const assembly=assemblies[0];
  if(assembly.children.length!==2 || assembly.meshes.length) throw Error('Unexpected assembly hierarchy');
  const groups={};
  for(const [body,name,count] of [['base','Part 1',13],['lid','Part 2',8]]){
    const matches=nodes.filter(n=>n.name===name);
    if(matches.length!==1 || !assembly.children.includes(matches[0])) throw Error(`Missing or ambiguous ${name}`);
    const node=matches[0];
    if(node.children.length || node.meshes.length!==count) throw Error(`Unexpected ${name} solid count`);
    groups[body]=node.meshes.map(index=>{
      if(!Number.isInteger(index)||!result.meshes[index]||result.meshes[index].name!=='') throw Error(`Unexpected ${name} solid name/index`);
      return {index,occurrence:name,mesh:result.meshes[index]};
    });
  }
  const indices=Object.values(groups).flat().map(s=>s.index);
  if(new Set(indices).size!==21 || result.meshes.length!==21 || nodes.some(n=>n!==assembly&&!assembly.children.includes(n)&&n.meshes.length)) throw Error('Unexpected or overlapping case solids');
  return groups;
}
module.exports={selectCaseGroups};
