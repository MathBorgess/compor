import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImageProposal,serializeImageProposal,IMAGE_PROPOSAL_SCHEMA} from '../src/image-proposal.mjs';
import {imageProposalDigest} from '../src/artwork-input.mjs';

const proposal={prompt:'Uma direção visual sintética',operation:'create',baseImageId:null,referenceIds:[]};
const frameId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('validador e schema público aceitam exatamente os mesmos nomes de campos',()=>{
 assert.deepEqual(Object.keys(IMAGE_PROPOSAL_SCHEMA.properties).sort(),['prompt','operation','baseImageId','referenceIds','changedDimension','format','frameId','frameIndex'].sort());
 for(const key of Object.keys(IMAGE_PROPOSAL_SCHEMA.properties)){
  const extra=key==='changedDimension'?{changedDimension:'style'}:key==='format'?{format:'story'}:key==='frameId'?{format:'carousel',frameId}:key==='frameIndex'?{format:'carousel',frameId,frameIndex:1}:{};
  const value={...proposal,...extra};
  assert.doesNotThrow(()=>parseImageProposal(value));
 }
 for(const key of ['apiKey','projectId','extra'])assert.throws(()=>parseImageProposal({...proposal,[key]:'valor'}));
});
test('dimensão criativa é opcional e fica vinculada ao digest da proposta',()=>{
  assert.deepEqual(parseImageProposal(proposal),proposal);
  for(const changedDimension of ['style','composition','hook']){
    const value={...proposal,changedDimension};assert.deepEqual(parseImageProposal(value),value);
    assert.equal(JSON.parse(serializeImageProposal(value)).changedDimension,changedDimension);
    assert.notEqual(imageProposalDigest(value),imageProposalDigest(proposal));
  }
  for(const changedDimension of ['major','estilo','',null,{},true])assert.throws(()=>parseImageProposal({...proposal,changedDimension}),/invalid_image_proposal/);
  assert.equal(IMAGE_PROPOSAL_SCHEMA.required.includes('changedDimension'),false);
});
