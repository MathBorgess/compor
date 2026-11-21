import test from 'node:test';
import assert from 'node:assert/strict';
import {createPieceVersionImageRoute} from '../lib/piece-version-image-route.ts';

const userId='11111111-1111-4111-8111-111111111111';
const projectId='22222222-2222-4222-8222-222222222222';
const pieceId='33333333-3333-4333-8333-333333333333';
const assetId='44444444-4444-4444-8444-444444444444';
const actor={userId,token:'jwt-synthetic'};

function route(fetchImpl,authenticate=async()=>actor){
  return createPieceVersionImageRoute({
    appOrigin:'https://compor.test',
    supabaseUrl:'https://project.supabase.co',
    publishableKey:'sb_publishable_test',
    authenticate,
    fetch:fetchImpl,
  });
}
const query=`https://compor.test/api/piece-version-images?projectId=${projectId}&pieceId=${pieceId}&version=2`;

test('leitura e vínculo usam o token da pessoa e repetir outro ativo não troca',async()=>{
  const calls=[];
  const api=route(async(url,options)=>{
    calls.push({pathname:url.pathname,authorization:options.headers.authorization,body:options.body?JSON.parse(options.body):null});
    if(url.pathname.endsWith('/piece_version_images'))return Response.json([{asset_id:assetId}]);
    return Response.json({status:'bound',assetId});
  });
  assert.deepEqual(await(await api.GET(new Request(query))).json(),{assetId});
  const post=new Request('https://compor.test/api/piece-version-images',{method:'POST',headers:{origin:'https://compor.test','content-type':'application/json'},body:JSON.stringify({projectId,pieceId,version:2,assetId})});
  assert.deepEqual(await(await api.POST(post)).json(),{status:'bound',assetId});
  assert.equal(calls[0].authorization,`Bearer ${actor.token}`);
  assert.equal(calls[0].pathname,'/rest/v1/piece_version_images');
  assert.deepEqual(calls[1].body,{p_project_id:projectId,p_piece_id:pieceId,p_version:2,p_asset_id:assetId});
  const conflict=route(async()=>Response.json({status:'conflict',assetId}));
  const again=await conflict.POST(new Request('https://compor.test/api/piece-version-images',{method:'POST',headers:{origin:'https://compor.test','content-type':'application/json'},body:JSON.stringify({projectId,pieceId,version:2,assetId:'55555555-5555-4555-8555-555555555555'})}));
  assert.equal(again.status,200);
  assert.deepEqual(await again.json(),{status:'conflict',assetId});
  const missing=route(async()=>Response.json([]));
  assert.deepEqual(await(await missing.GET(new Request(query))).json(),{assetId:null});
  const foreign=route(async()=>Response.json([]),async()=>null);
  assert.equal((await foreign.GET(new Request(query))).status,401);
  assert.equal((await api.POST(new Request('https://compor.test/api/piece-version-images',{method:'POST',headers:{origin:'https://outro.test','content-type':'application/json'},body:'{}'}))).status,403);
});
