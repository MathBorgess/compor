import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostRoutes} from '../lib/post-route.ts';
import {createPostStore} from '../lib/post-store.ts';
import {createPieceRoutes} from '../lib/piece-route.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const projectId=id(2),pieceId=id(3),origin='https://app.test';
const request=(method,body,extra={})=>new Request(origin+'/api/posts',{method,headers:{origin,'content-type':'application/json',...extra},body:JSON.stringify(body)});
function fixture(){
 const calls=[],records=new Map();let actor={userId:id(1),token:'alice-token'},owned=true,invalid=false;
 const store=createPostStore({url:'https://example.supabase.co',anonKey:'public',fetchImpl:async(url,options)=>{
  calls.push({url:String(url),options});const body=JSON.parse(options.body),key=body.p_project_id+':'+body.p_piece_id;
  if(invalid)return Response.json({status:'created',post:{projectId:id(9),pieceId,name:'Outro',deleted:false}});
  if(String(url).endsWith('list_project_posts'))return Response.json([...records.values()]);
  const old=records.get(key);
  if(String(url).endsWith('create_project_post')){
   if(old?.deleted)return Response.json({status:'not_found'});
   if(old&&old.name!==body.p_name)return Response.json({status:'conflict'});
   const post=old??{projectId:body.p_project_id,pieceId:body.p_piece_id,name:body.p_name,deleted:false};records.set(key,post);return Response.json({status:'created',post});
  }
  const post={...old,projectId:body.p_project_id,pieceId:body.p_piece_id,name:old?.name??'',deleted:true};records.set(key,post);return Response.json({status:'deleted',post});
 }});
 return {calls,records,store,routes:createPostRoutes({appOrigin:origin,resolveActor:async()=>actor,ownsProject:async()=>owned,postStore:store}),setActor:value=>actor=value,setOwned:value=>owned=value,setInvalid:()=>invalid=true};
}
test('nome é validado, criação é idempotente e exclusão não permite ressurreição',async()=>{
 const f=fixture(),body={projectId,pieceId,name:'  Live gratuita  '};
 for(let i=0;i<2;i++){const response=await f.routes.POST(request('POST',body));assert.equal(response.status,200);assert.equal((await response.json()).post.name,'Live gratuita');}
 assert.equal(f.records.size,1);assert.equal((await f.routes.POST(request('POST',{...body,name:'Diferente'}))).status,409);
 for(let i=0;i<2;i++)assert.equal((await f.routes.DELETE(request('DELETE',{projectId,pieceId}))).status,200);
 assert.equal((await f.routes.POST(request('POST',body))).status,404);
 assert.equal(f.calls[0].options.headers.authorization,'Bearer alice-token');assert.equal(f.calls[0].options.redirect,'error');
});
test('origem, identidade e propriedade são verificadas antes da escrita',async()=>{
 const f=fixture(),body={projectId,pieceId,name:'Um post'};
 assert.equal((await f.routes.POST(request('POST',body,{origin:'https://attacker.test'}))).status,403);
 f.setActor(null);assert.equal((await f.routes.POST(request('POST',body))).status,401);
 f.setActor({userId:id(8),token:'bob-token'});f.setOwned(false);assert.equal((await f.routes.DELETE(request('DELETE',{projectId,pieceId}))).status,404);assert.equal(f.calls.length,0);
});
test('corpos inválidos, segredos, campos extras e nomes vazios são recusados',async()=>{
 const f=fixture();for(const name of ['', '   ', 'a'.repeat(201),'Nome\nlinha','sk-not-a-name'])assert.equal((await f.routes.POST(request('POST',{projectId,pieceId,name}))).status,400);
 assert.equal((await f.routes.POST(request('POST',{projectId,pieceId,name:'Post',ownerId:id(1)}))).status,400);
 assert.equal((await f.routes.DELETE(request('DELETE',{projectId,pieceId:'inválido'}))).status,400);
 assert.equal((await f.routes.POST(request('POST',{projectId,pieceId,name:'Post',extra:'x'.repeat(5000)}))).status,400);assert.equal(f.calls.length,0);
});
test('resposta de outro projeto é recusada como resultado incerto sem repetir escrita',async()=>{
 const f=fixture();f.setInvalid();const response=await f.routes.POST(request('POST',{projectId,pieceId,name:'Post'}));assert.equal(response.status,502);assert.equal((await response.json()).retryAutomatically,false);assert.equal(f.calls.length,1);
});
test('catálogo usa token da pessoa e rejeita mistura de projetos',async()=>{
 const f=fixture(),context={actor:{userId:id(1)},token:'alice-token'};
 f.records.set('one',{projectId,pieceId,name:'Uma peça',deleted:true});assert.equal((await f.store.list(context,projectId))[0].deleted,true);
 f.records.set('other',{projectId:id(9),pieceId:id(10),name:'Outro projeto',deleted:false});await assert.rejects(()=>f.store.list(context,projectId));
});
test('listagem web remove versões de posts excluídos e devolve seus nomes',async()=>{
 const f=fixture();f.records.set('deleted',{projectId,pieceId,name:'Excluído',deleted:true});
 const routes=createPieceRoutes({resolveActor:async()=>({userId:id(1),token:'alice-token'}),ownsProject:async()=>true,pieceStore:{listProject:async()=>[{piece_id:pieceId},{piece_id:id(8)}]},postStore:f.store});
 const response=await routes.GET(new Request(origin+'/api/pieces?projectId='+projectId));const body=await response.json();assert.equal(response.status,200);assert.deepEqual(body.versions,[{piece_id:id(8)}]);assert.equal(body.posts[0].name,'Excluído');
});
