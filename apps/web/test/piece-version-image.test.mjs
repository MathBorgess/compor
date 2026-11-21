import test from 'node:test';
import assert from 'node:assert/strict';
import {bindVersionImage, publishVersionPng, readVersionImage, versionImageAssetId} from '../lib/piece-version-image.ts';

const projectId='11111111-1111-4111-8111-111111111111';
const pieceId='22222222-2222-4222-8222-222222222222';
const png=new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,1])],{type:'image/png'});

test('o identificador da imagem é estável e repetir não troca os bytes',async()=>{
  const first=await versionImageAssetId(projectId,pieceId,4);
  const second=await versionImageAssetId(projectId,pieceId,4);
  const other=await versionImageAssetId(projectId,pieceId,5);
  assert.equal(first,second);
  assert.notEqual(first,other);
  assert.match(first,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const stored=[];
  const fetchImpl=async(url,options)=>{
    const address=new URL(url,'https://compor.test');
    if(address.pathname==='/api/images'){
      const assetId=address.searchParams.get('assetId');
      const previous=stored.find(item=>item.assetId===assetId);
      if(previous)return Response.json({error:'asset_exists',retryAutomatically:false},{status:409});
      stored.push({assetId,body:options.body});
      return Response.json({status:'stored',assetId},{status:201});
    }
    const body=JSON.parse(options.body);
    assert.equal(body.assetId,first);
    return Response.json({status:'bound',assetId:body.assetId});
  };
  assert.equal(await publishVersionPng({projectId,pieceId,version:4,png,fetchImpl}),'published');
  assert.equal(await publishVersionPng({projectId,pieceId,version:4,png:new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,2])],{type:'image/png'}),fetchImpl}),'published');
  assert.equal(stored.length,1);
  assert.equal(stored[0].body,png);
  assert.equal(await readVersionImage({projectId,pieceId,version:4,fetchImpl:async()=>Response.json({assetId:first})}),first);
  assert.equal(await bindVersionImage({projectId,pieceId,version:4,assetId:other,fetchImpl:async()=>Response.json({status:'conflict',assetId:first})}),'conflict');
});
