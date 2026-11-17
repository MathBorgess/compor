import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {referenceSelectionProjection,referenceSelectionPublic} from '../lib/reference-selection-projection.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('projeção preserva ordem e exclusão por post sem inferir origem legada',async()=>{
 const state={references:[{id:id(1)},{id:id(2),source:{kind:'local-upload'}},{id:id(3),source:{originUrl:'https://www.pinterest.com/pin/123/',board:'behance/advertising'}},{id:id(4),source:{kind:'generated',projectId:id(9),imageId:id(8)}}],projectReferenceIds:[id(1),id(2)],posts:{[id(10)]:{deleted:false,referenceIds:[],excludedReferenceIds:[]},[id(11)]:{deleted:false,referenceIds:[id(3),id(4)],excludedReferenceIds:[id(2)]}}};
 const value=referenceSelectionProjection(state);assert.deepEqual(value.references.map(item=>item.id),[id(2),id(3),id(4)]);assert.deepEqual(value.projectReferenceIds,[id(2)]);assert.deepEqual(value.posts,[{pieceId:id(11),referenceIds:[id(3),id(4)],excludedReferenceIds:[id(2)]}]);
 const result=await referenceSelectionPublic(value);
 for(const [index,item] of value.references.entries())assert.equal(result.references[index].sourceDigest,createHash('sha256').update(`compor-reference-source-v1\0${JSON.stringify({inputOrigin:item.inputOrigin,source:item.source})}`).digest('hex'));
});
