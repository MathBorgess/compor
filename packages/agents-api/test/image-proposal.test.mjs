import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImageProposal,serializeImageProposal,IMAGE_PROPOSAL_SCHEMA} from '../src/image-proposal.mjs';
import {imageProposalDigest} from '../src/artwork-input.mjs';

const proposal={prompt:'Uma direção visual sintética',operation:'create',baseImageId:null,referenceIds:[]};
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
