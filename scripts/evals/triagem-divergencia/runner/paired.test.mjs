import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {packet} from '../dataset/packets.mjs';
import {openLedger,digest} from './ledger.mjs';
import {matchedInputs} from './round.mjs';
import {imageSlot,planCase} from './provider.mjs';

test('both arms keep selected uploads and exactly one optional input differs',()=>{
  const p=packet('dev-feira','with');
  const plan={referenceIds:p.visualInput.entries.map(e=>e.id)};
  const paired=matchedInputs(plan,p);
  assert.equal(paired.with.length-paired.without.length,1);
  assert.deepEqual(paired.without,paired.with.filter(e=>e.id!==p.rubric.optionalId));
  assert.equal(matchedInputs({referenceIds:paired.without.map(e=>e.id)},p),null);
});

test('provider rejection consumes a receipt without repeating an external POST',async()=>{
  const db=openLedger(':memory:',{plans:60,images:60});
  let calls=0;
  const key='sk-synthetic-test-session-for-this-fixture';
  const params={ledger:db,id:'0/dev-feira/with/plan',packet:packet('dev-feira','with'),key,
    fetchApi:async(url,init)=>{calls++;assert.equal(new URL(url).pathname,'/v1/agents/sessions');assert.equal(init.headers.get('authorization'),'Bearer '+key);return Response.json({}, {status:401});}};
  assert.equal((await planCase(params)).state,'rejected');
  assert.equal((await planCase(params)).state,'rejected');
  assert.equal(calls,1);db.close();
});

test('real image adapter binds the bytes, hashes the received file and reuses its receipt',async()=>{
  const p=packet('dev-feira','with'),db=openLedger(':memory:',{plans:60,images:60});
  const dir=mkdtempSync(join(tmpdir(),'compor-paired-test-'));
  const bytes=Buffer.from(p.referenceImages[0].data,'base64');
  bytes.writeUInt32BE(1024,16);bytes.writeUInt32BE(1280,20);
  let calls=0;
  const params={ledger:db,id:'test/w/1',prompt:'A confirmed offer',images:p.referenceImages,file:join(dir,'art.png'),
    key:'sk-synthetic-test-session-for-this-fixture',fetchApi:async(url,init)=>{
      calls++;assert.equal(url,'https://api.openai.com/v1/images/edits');
      assert.equal(init.body.getAll('image[]').length,2);
      return Response.json({data:[{b64_json:bytes.toString('base64')}],usage:{input_tokens:12,output_tokens:20,total_tokens:32}});
    }};
  try{
    const row=await imageSlot(params);
    assert.equal(row.state,'complete');assert.equal(row.result.sha256,digest(readFileSync(params.file)));
    assert.equal(row.result.delivered[0].sha256,p.visualInput.entries[0].transport.sha256);
    assert.deepEqual(await imageSlot(params),row);assert.equal(calls,1);
    await assert.rejects(imageSlot({...params,prompt:'Different premise'}),/binding_changed/);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
