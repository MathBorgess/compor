import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateImageListingHandler } from '../src/listing.mjs';

const actor={userId:'11111111-1111-4111-8111-111111111111',token:'synthetic-user-token'};
const project='22222222-2222-4222-8222-222222222222',piece='33333333-3333-4333-8333-333333333333';
const asset='44444444-4444-4444-8444-444444444444';
const page=Array.from({length:50},(_,i)=>`44444444-4444-4444-8444-${String(i+1).padStart(12,'0')}`);
const url=`https://compor.example/api/image-assets?projectId=${project}&pieceId=${piece}&version=1`;
test('lista referências autenticadas com origem desconhecida e cursor explícito',async()=>{
 let calls=0;
 const handler=createPrivateImageListingHandler({supabaseUrl:'https://project.supabase.co',publishableKey:'sb_publishable_test',authenticate:async()=>actor,fetch:async(target,init)=>{
  calls++;assert.equal(target.pathname,'/rest/v1/rpc/list_piece_image_assets');assert.equal(init.headers.authorization,`Bearer ${actor.token}`);
  const body=JSON.parse(init.body);assert.deepEqual(body,{p_project_id:project,p_piece_id:piece,p_version:1,p_after:null});
  return Response.json({assets:page,nextCursor:page.at(-1)});
 }});
 const response=await handler(new Request(url));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(await response.json(),{assets:page.map(assetId=>({assetId,origin:'unknown'})),nextCursor:page.at(-1)});assert.equal(calls,1);
});
test('rejeita acesso anônimo, parâmetros inválidos e resultado malformado sem expor detalhes',async()=>{
 let calls=0;
 const make=authenticate=>createPrivateImageListingHandler({supabaseUrl:'https://project.supabase.co',publishableKey:'sb_publishable_test',authenticate,fetch:async()=>{calls++;return Response.json({assets:[asset],nextCursor:'bad'});}});
 assert.equal((await make(async()=>null)(new Request(url))).status,401);
 assert.equal((await make(async()=>actor)(new Request(`${url}&after=bad`))).status,400);
 assert.equal(calls,0);
 const response=await make(async()=>actor)(new Request(url));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/synthetic-user-token/);
});

test('projeto ou versão inacessível é indistinguível de inexistente',async()=>{
 const handler=createPrivateImageListingHandler({supabaseUrl:'https://project.supabase.co',publishableKey:'sb_publishable_test',authenticate:async()=>actor,fetch:async()=>Response.json({error:'not_found'})});
 const response=await handler(new Request(url));assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:'not_found'});
});
