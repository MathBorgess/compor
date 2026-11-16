import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createFileStudioDriver} from '../shared-driver.mjs';
import {parseStudioState,prepareAdjustment,selectDraft,updateOfferFacts} from '../../../apps/web/lib/studio-state.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

async function fixture(t){
  const runDir=await mkdtemp(join(tmpdir(),'compor-file-driver-'));
  const requests=[];
  const ctx={runDir,origin:'http://127.0.0.1:3000',actorA:id(1),newId:randomUUID,
    async request(actor,path,{body}){
      requests.push({actor,path,body});
      assert.equal(path,'/api/posts');
      return {status:201,body:{status:'created',post:{projectId:body.projectId,pieceId:body.pieceId,name:body.name,deleted:false}}};
    },
  };
  const driver=await createFileStudioDriver(ctx,{projectId:id(2)});
  t.after(async()=>{driver.close();await rm(runDir,{recursive:true,force:true});});
  async function confirm(pieceId){
    driver.controller.preparePost(pieceId);
    driver.controller.changePreparation({name:`Post ${pieceId}`,message:'Preço declarado: R$ 20'});
    assert.equal((await driver.controller.confirmPost(driver.creationPorts)).status,'created');
  }
  return {driver,requests,confirm};
}

test('resumed chat uses canonical draft and scoped projection without persisting projection fields',async t=>{
  const {driver,requests,confirm}=await fixture(t);
  await confirm(id(3));
  const shared={id:id(5),name:'shared.png',mime:'image/png',size:68,width:1,height:1};
  const local={...shared,id:id(6),name:'post-only.png'};
  driver.controller.selectReference(shared,'references');
  driver.controller.selectReference(local,id(3));
  await confirm(id(4));
  driver.change(state=>selectDraft(state,{pieceId:id(3),baseVersion:0}));
  const facts=[{id:id(7),label:'Preço',value:'R$ 20',status:'confirmed'},{id:id(8),label:'Data',value:'A confirmar',status:'pending'}];
  driver.change(state=>updateOfferFacts(state,facts));
  driver.change(state=>prepareAdjustment(state,{requestId:id(9),messageId:id(10),instruction:'Crie uma proposta com os fatos declarados.',conversationId:id(3),createdAt:'2026-11-16T12:00:00.000Z',eventId:id(11)}));
  await driver.flush();driver.close();await driver.reopen();
  const before=driver.getState(),context=driver.getChatContext(id(3));
  assert.equal(context.pieceId,id(3));
  assert.deepEqual(context.references.map(reference=>reference.id),[id(5),id(6)]);
  assert.deepEqual(context.offerFacts,facts);
  assert.equal(context.postContext.message,'Preço declarado: R$ 20');
  assert.equal(Object.hasOwn(context,'referenceScope'),false);
  assert.equal(driver.getState(),before);
  assert.deepEqual(parseStudioState(JSON.parse(await readFile(driver.statePath,'utf8'))),before);
  assert.equal(requests.length,2);

  driver.change(state=>selectDraft(state,{pieceId:id(4),baseVersion:0}));
  assert.deepEqual(driver.getChatContext(id(4)).references.map(reference=>reference.id),[id(5)]);
  assert.throws(()=>driver.getChatContext(id(3)),/conversation_selection_mismatch/);
});

test('chat context requires an explicit selected scope',async t=>{
  const {driver,confirm}=await fixture(t);
  assert.throws(()=>driver.getChatContext(id(3)),/conversation_selection_mismatch/);
  await confirm(id(3));
  assert.throws(()=>driver.getChatContext('../other-project'),/invalid_conversation_scope/);
  const context=driver.getChatContext('references');
  assert.equal(context.pieceId,id(3));
  assert.equal(Object.hasOwn(context,'postContext'),false);
});
