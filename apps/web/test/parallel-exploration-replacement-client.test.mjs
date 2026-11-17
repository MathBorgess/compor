import test from 'node:test';
import assert from 'node:assert/strict';
import {createParallelReplacementClient} from '../lib/parallel-exploration-replacement-client.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const preparation={projectId:id(1),conversationId:'references',batchId:id(2),planRequestId:id(3),credentialSource:'byok',context:{idea:'synthetic'},plan:{version:1},stage:'executing'};
const claim={position:2,previousId:id(4),requestId:id(5),intentId:id(6),expectedEpoch:7};
const key='sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

test('reposição cria intenção vinculada e despacha uma vez com IDs e plano originais',async()=>{
 const calls=[];const client=createParallelReplacementClient(async(path,options)=>{const body=JSON.parse(options.body);calls.push({path,body,headers:options.headers});return path.endsWith('/intent')?Response.json({status:'created',epoch:8}):Response.json({status:'completed',batchId:id(2),requestId:id(5),retryAutomatically:false});});
 const signal=new AbortController().signal;
 assert.equal(await client.create(preparation,claim,key,signal),8);await client.dispatch(preparation,claim,'proof-in-memory',key,signal);
 assert.deepEqual(calls.map(call=>call.path),['/api/studio/exploration-batches/intent','/api/studio/exploration-batches/replace']);
 assert.equal(calls[0].body.purpose,'replacement');assert.equal(calls[0].body.previousId,claim.previousId);assert.equal(calls[1].body.requestId,claim.requestId);assert.equal(calls[1].headers['x-compor-openai-key'],key);assert.equal(calls[1].body.planBinding,'proof-in-memory');
});

test('resposta incerta ou divergente não provoca repetição',async()=>{
 let calls=0;const signal=new AbortController().signal;
 const client=createParallelReplacementClient(async()=>{calls++;return Response.json({status:'unknown',retryAutomatically:false},{status:503});});
 await assert.rejects(client.create(preparation,claim,key,signal));assert.equal(calls,1);
 await assert.rejects(client.dispatch(preparation,claim,'proof-in-memory',key,signal));assert.equal(calls,2);
 const mismatch=createParallelReplacementClient(async()=>Response.json({status:'created',epoch:9}));await assert.rejects(mismatch.create(preparation,claim,key,signal));
});
