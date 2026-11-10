import test from 'node:test';
import assert from 'node:assert/strict';
import {groupVariants} from '../lib/studio-variants.ts';
const piece='post',other='outro';
const v=(version,baseVersion,changedDimension=null,operation=null)=>({piece_id:piece,version,metadata:{baseVersion,changedDimension,operation}});

test('histórico antigo fica no primeiro card sem classificação retroativa',()=>{
  const versions=[{piece_id:piece,version:1},v(2,1),v(3,1),{piece_id:other,version:1}];
  const groups=groupVariants(versions,piece);
  assert.equal(groups.length,1);assert.deepEqual(groups[0].versions.map(item=>item.version),[1,2,3]);assert.equal(groups[0].latest.version,3);
});
test('dimensão abre card e retoques seguem a origem, inclusive ramificação de variante anterior',()=>{
  const versions=[v(7,2,null,'edit'),v(1,null),v(2,1,'style','edit'),v(3,2,null,'create'),v(4,3,'composition','create'),v(5,1,null,'edit'),v(6,4,null,'edit')];
  const groups=groupVariants(versions,piece);
  assert.deepEqual(groups.map(group=>({root:group.root.version,latest:group.latest.version,versions:group.versions.map(item=>item.version)})),[
    {root:1,latest:5,versions:[1,5]},{root:2,latest:7,versions:[2,3,7]},{root:4,latest:6,versions:[4,6]},
  ]);
  assert.deepEqual(versions.map(item=>item.version),[7,1,2,3,4,5,6],'agrupar não altera a lista original');
});
