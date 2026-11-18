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
 assert.equal(calls[0].body.purpose,'replacement');assert.equal(calls[0].body.previousId,claim.previousId);assert.equal(calls[1].body.requestId,claim.requestId);assert.equal(calls[1].body.planBinding,'proof-in-memory');
 for(const call of calls){assert.equal(call.headers['x-compor-openai-key'],key);assert.equal(Object.hasOwn(call.body,'apiKey'),false);}
 assert.deepEqual(calls.map(call=>call.headers['content-type']),['application/vnd.compor.byok+json','application/json']);
});

test('resposta incerta ou divergente não provoca repetição',async()=>{
 let calls=0;const signal=new AbortController().signal;
 const client=createParallelReplacementClient(async()=>{calls++;return Response.json({status:'unknown',retryAutomatically:false},{status:503});});
 await assert.rejects(client.create(preparation,claim,key,signal));assert.equal(calls,1);
 await assert.rejects(client.dispatch(preparation,claim,'proof-in-memory',key,signal));assert.equal(calls,2);
 const mismatch=createParallelReplacementClient(async()=>Response.json({status:'created',epoch:9}));await assert.rejects(mismatch.create(preparation,claim,key,signal));
});

test('reposição visual reenvia apenas bytes congelados do subset do plano assinado',async t=>{
 const {createHash}=await import('node:crypto');const {validateExplorationPlan}=await import('@compor/agents-api/exploration-plan-contract');
 const original=globalThis.createImageBitmap;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});t.after(()=>{globalThis.createImageBitmap=original;});
 const bytes=[Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7YQAAAAASUVORK5CYII=','base64'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64')];
 const entries=bytes.map((value,index)=>{const file={sha256:createHash('sha256').update(value).digest('hex'),mime:'image/png',byteLength:value.length};return{id:id(10+index),ordinal:index+1,role:'reference',...(index===1?{inputOrigin:'external',source:{originUrl:'https://www.pinterest.com/pin/123/',board:'behance/advertising'}}:{inputOrigin:'local-upload',source:null}),original:file,transport:{...file,width:1,height:1},transformation:'none'};});
 const visualInput={version:2,policy:'optimized-v1',externalConsent:true,entries},snapshot={manifest:visualInput,blobs:bytes.map(value=>new Blob([value],{type:'image/png'}))};
 const context={idea:'Oficina',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
 const items=[1,2,3].map(position=>({position,creativePrompt:`caminho ${position}`,composition:`composição ${position}`,contrast:`contraste ${position}`,differenceFromOthers:`diferença ${position}`}));
 const plan=validateExplorationPlan({version:2,items,referenceIds:[id(10),id(12)]},context,visualInput),visual={...preparation,context,plan,visualInput};
 const calls=[],client=createParallelReplacementClient(async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return path.endsWith('/intent')?Response.json({status:'created',epoch:8}):Response.json({status:'completed',batchId:id(2),requestId:id(5),retryAutomatically:false});});
 const signal=new AbortController().signal;assert.equal(await client.create(visual,claim,key,signal),8);await client.dispatch(visual,claim,'proof-in-memory',key,signal,snapshot);
 assert.deepEqual(calls[0].body.visualInput,visualInput);assert.equal('referenceImages' in calls[0].body,false);
 assert.deepEqual(calls[1].body.visualInput,visualInput);assert.deepEqual(calls[1].body.referenceImages.map(image=>image.id),[id(10),id(12)]);
 assert.deepEqual(calls[1].body.referenceImages.map(image=>Buffer.from(image.data,'base64')),[bytes[0],bytes[2]]);
 const localEntries=[entries[0],entries[2]].map((entry,index)=>{const {source,...rest}=entry;return {...rest,ordinal:index+1};});
 const localManifest={version:1,policy:'optimized-v1',entries:localEntries},localSnapshot={manifest:localManifest,blobs:[snapshot.blobs[0],snapshot.blobs[2]]};
 const localPlan=validateExplorationPlan({version:1,items},context,localManifest);
 await client.dispatch({...visual,visualInput:localManifest,plan:localPlan},claim,'proof-in-memory',key,signal,localSnapshot);
 assert.deepEqual(calls.at(-1).body.referenceImages.map(image=>image.id),[id(10),id(12)],'protocolo v1 mantém todas as referências locais');
 const before=calls.length;
 await assert.rejects(client.dispatch(visual,claim,'proof-in-memory',key,signal));
 await assert.rejects(client.dispatch(visual,claim,'proof-in-memory',key,signal,{...snapshot,blobs:[snapshot.blobs[1],...snapshot.blobs.slice(1)]}));
 await assert.rejects(client.dispatch({...visual,plan:{...plan,referenceIds:[id(12)]}},claim,'proof-in-memory',key,signal,snapshot));
 const different=structuredClone(visualInput);different.entries[0].transport.sha256='f'.repeat(64);different.entries[0].transformation='optimized-v1';
 await assert.rejects(client.dispatch(visual,claim,'proof-in-memory',key,signal,{...snapshot,manifest:different}));
 assert.equal(calls.length,before,'nenhuma falha local inicia um novo POST');
 let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 globalThis.createImageBitmap=async()=>{entered();await gate;return {width:1,height:1,close(){}};};
 const controller=new AbortController(),pending=client.dispatch(visual,claim,'proof-in-memory',key,controller.signal,snapshot);
 await started;controller.abort();release();await assert.rejects(pending);assert.equal(calls.length,before,'pausa durante reidratação impede POST');
});
