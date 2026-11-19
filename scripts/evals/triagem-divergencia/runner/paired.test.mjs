import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {crc32, deflateSync} from 'node:zlib';
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

function studioPng({width=1024,height=1280,pixelRows=height}={}){
  function chunk(name,data){
    const type=Buffer.from(name),size=Buffer.alloc(4),crc=Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(Buffer.concat([type,data])));
    return Buffer.concat([size,type,data,crc]);
  }
  // One grayscale byte per pixel and a zero filter byte at the start of each row.
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),
    chunk('IDAT',deflateSync(Buffer.alloc((width+1)*pixelRows))),chunk('IEND',Buffer.alloc(0))]);
}

test('real image adapter binds the bytes, hashes the received file and reuses its receipt',async()=>{
  const p=packet('dev-feira','with'),db=openLedger(':memory:',{plans:60,images:60});
  const dir=mkdtempSync(join(tmpdir(),'compor-paired-test-'));
  const bytes=studioPng();
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

test('bad PNG never closes a paid image as complete or submits it again',async()=>{
  const valid=studioPng(), badCrc=Buffer.from(valid);
  badCrc[29]^=1; // Corrupt the IHDR CRC while preserving the dimensions and every pixel.
  const fixtures=[
    {bytes:badCrc,adapterRejects:true},
    {bytes:valid.subarray(0,-5),adapterRejects:true},
    {bytes:studioPng({pixelRows:16}),adapterRejects:true},
    {bytes:studioPng({width:1023}),adapterRejects:false},
  ];
  const dir=mkdtempSync(join(tmpdir(),'compor-invalid-png-'));
  const ledger=openLedger(':memory:',{plans:60,images:60});
  try{
    for(const [index,{bytes,adapterRejects}] of fixtures.entries()){
      const id='bad/'+index;
      let calls=0;
      const params={ledger,id,prompt:'Synthetic brief',images:[],file:join(dir,index+'.png'),
        key:'sk-synthetic-test-session-for-this-fixture',fetchApi:async()=>{
          calls++;
          return Response.json({data:[{b64_json:bytes.toString('base64')}]});
        }};
      if(adapterRejects)assert.equal((await imageSlot(params)).state,'unknown');
      else await assert.rejects(imageSlot(params),/invalid_image_png/);
      assert.equal(ledger.get(id).state,'unknown');
      assert.equal(existsSync(params.file),false);
      assert.equal((await imageSlot(params)).state,'unknown');
      assert.equal(calls,1);
    }
  }finally{ledger.close();rmSync(dir,{recursive:true,force:true});}
});
