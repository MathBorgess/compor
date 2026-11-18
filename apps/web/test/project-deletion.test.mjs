import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectRoutes} from '../lib/project-route.ts';
import {createWebProjectStore} from '../lib/project-store.ts';
const projectId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222',appOrigin='http://localhost:3000';
const request=(body={projectId,expectedRevision:1},origin=appOrigin)=>new Request(appOrigin+'/api/projects',{method:'DELETE',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('exclusão exige origem, identidade e contrato estrito, sem efeitos antes da validação',async()=>{
 let calls=0;const projectStore={remove:async()=>{calls++;return {status:'deleted',projectId};}};
 const routes=createProjectRoutes({appOrigin,resolveActor:async()=>({userId,token:'user-token'}),projectStore});
 assert.equal((await routes.DELETE(request(undefined,'http://evil.test'))).status,403);
 assert.equal((await createProjectRoutes({appOrigin,resolveActor:async()=>null,projectStore}).DELETE(request())).status,401);
 for(const body of [{projectId,expectedRevision:0},{projectId:'other',expectedRevision:1},{projectId,expectedRevision:1,ownerId:userId}])assert.equal((await routes.DELETE(request(body))).status,400);
 assert.equal(calls,0);assert.equal((await routes.DELETE(request())).status,200);assert.equal(calls,1);
});
test('conflito, projeto alheio e resultado incerto não são confirmados nem repetidos',async()=>{
 for(const [result,status] of [[{status:'not_found'},404],[{status:'conflict',currentRevision:2},409],[null,502]]){
  let calls=0;const routes=createProjectRoutes({appOrigin,resolveActor:async()=>({userId,token:'token'}),projectStore:{remove:async()=>{calls++;if(!result)throw Error('private');return result;}}});
  const response=await routes.DELETE(request());assert.equal(response.status,status);assert.equal(calls,1);assert.doesNotMatch(await response.text(),/private/);
 }
});
test('exclusão bloqueada por geração pendente retorna 409',async()=>{
 const expected={status:'pending'};
 const projectStore=createWebProjectStore({url:'https://example.test',anonKey:'public',fetchImpl:async()=>Response.json(expected)});
 const routes=createProjectRoutes({appOrigin,resolveActor:async()=>({userId,token:'token'}),projectStore});
 const response=await routes.DELETE(request());
 assert.equal(response.status,409);
 assert.deepEqual(await response.json(),expected);
});
test('adaptador usa token pessoal, filtra projetos excluídos e rejeita confirmação de outro projeto',async()=>{
 let invalid=false;const calls=[];
 const store=createWebProjectStore({url:'https://example.test',anonKey:'public',fetchImpl:async(url,options)=>{calls.push({url,options});return options.method==='GET'?Response.json([]):Response.json({status:'deleted',projectId:invalid?userId:projectId});}});
 const context={actor:{userId},token:'personal-token'};await store.list(context);
 assert.equal(calls[0].url.searchParams.get('deleted_at'),'is.null');
 assert.deepEqual(await store.remove(context,{projectId,expectedRevision:1}),{status:'deleted',projectId});
 assert.equal(calls[1].options.headers.authorization,'Bearer personal-token');assert.deepEqual(JSON.parse(calls[1].options.body),{p_project_id:projectId,p_expected_revision:1});
 invalid=true;await assert.rejects(store.remove(context,{projectId,expectedRevision:1}));
});
