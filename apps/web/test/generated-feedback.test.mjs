import test from 'node:test';
import assert from 'node:assert/strict';
import { currentGeneratedFeedback } from '../lib/generated-feedback-contract.ts';
import { createGeneratedFeedbackRoute } from '../lib/generated-feedback-route.ts';
import { createGeneratedFeedbackStore } from '../lib/generated-feedback-store.ts';
const user='00000000-0000-4000-8000-000000000001', project='00000000-0000-4000-8000-000000000002', image='00000000-0000-4000-8000-000000000003', first='00000000-0000-4000-8000-000000000004', second='00000000-0000-4000-8000-000000000005';
const base={projectId:project,imageId:image,comment:'',supersedes:null,createdAt:'2026-11-06T10:00:00Z',plan:{composition:'grade editorial',contrast:'espaço vazio'}};
test('corrigir rejeição não transforma comentário nem imagem em atributo aprovado',()=>{
 const records=[{...base,id:first,action:'rejected'},{...base,id:second,action:'selected',supersedes:first,createdAt:'2026-11-06T11:00:00Z'}];
 assert.deepEqual(currentGeneratedFeedback(records),[{action:'selected',comment:'',composition:'grade editorial',contrast:'espaço vazio'}]);
});
test('rota exige origem, dono, e correção do mesmo tipo e imagem',async()=>{
 const rows=[{...base,id:first,action:'rejected'}];let calls=0;
 const route=createGeneratedFeedbackRoute({appOrigin:'http://localhost:3000',resolveActor:async()=>({userId:user,token:'token'}),ownsProject:async(_actor,id)=>id===project,store:()=>({list:async()=>rows,insert:async()=>{calls++;}})});
 const request=body=>new Request('http://localhost:3000/api/studio/explorations/signals',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await route(request({id:second,projectId:project,imageId:image,action:'selected',comment:'',supersedes:first}))).status,201);
 assert.equal((await route(request({id:second,projectId:project,imageId:image,action:'comment',comment:'bom',supersedes:first}))).status,409);
 assert.equal((await route(request({id:second,projectId:project,imageId:image,action:'comment',comment:'sk-secret',supersedes:null}))).status,400);
 assert.equal(calls,1);
});
test('retry de sinal existente confirma apenas payload idêntico',async()=>{
 const saved={id:first,project_id:project,image_id:image,action:'selected',comment:'',supersedes:null,created_at:'2026-11-06T10:00:00Z'};
 let altered=false;
 const store=createGeneratedFeedbackStore({config:{key:'public',service:'http://localhost'},actor:{userId:user,token:'token'},fetchApi:async(_url,options)=>options.method==='POST'?new Response(null,{status:409}):Response.json([{...saved,comment:altered?'outro':''}])});
 const signal={id:first,projectId:project,imageId:image,action:'selected',comment:'',supersedes:null};
 assert.equal((await store.insert(signal)).id,first);
 altered=true;await assert.rejects(store.insert(signal));
});
