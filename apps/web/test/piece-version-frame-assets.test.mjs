import test from 'node:test';
import assert from 'node:assert/strict';
import {frameVersionAssetId, publishSavedFrameImage, readSavedFrameImage} from '../lib/piece-version-frame-assets.ts';
import {pieceFrameSchema} from '../lib/studio-domain.ts';

const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const source={projectId:id(1),pieceId:id(2),frameId:id(3),version:1};
const image=value=>new Blob([Uint8Array.of(137,80,78,71,13,10,26,10,value)],{type:'image/png'});

test('o identificador de uma lâmina vincula escopo, versão, slot e bytes',async()=>{
  const png=image(1);
  const assetId=await frameVersionAssetId(source,png);
  assert.equal(assetId,await frameVersionAssetId(source,image(1)));
  for(const patch of [{projectId:id(4)},{pieceId:id(4)},{frameId:id(4)},{version:2}]) {
    assert.notEqual(assetId,await frameVersionAssetId({...source,...patch},png));
  }
  assert.notEqual(assetId,await frameVersionAssetId(source,image(2)));
  assert.equal(pieceFrameSchema.parse({id:source.frameId,position:1,role:'abertura',headline:'Título',body:'',visualCue:'',assetId}).assetId,assetId);
});

test('publicação reconcilia confirmação perdida ou conflito somente com bytes correspondentes',async()=>{
  const png=image(1), address={...source,assetId:await frameVersionAssetId(source,png)};
  for(const [response,read,verified] of [
    [201,png,true],[409,png,true],[502,png,true],[null,png,true],
    [201,image(2),false],[409,image(2),false],[null,null,false],
  ]) {
    const calls=[];
    const fetchImpl=async(url,options)=>{
      const target=new URL(url,'https://compor.test');
      assert.equal(target.pathname,'/api/images');
      assert.deepEqual(Object.fromEntries(target.searchParams),{projectId:source.projectId,pieceId:source.pieceId,version:'1',assetId:address.assetId});
      calls.push(options.method??'GET');
      if(options.method==='POST'){
        assert.equal(options.body,png);
        if(response===null)throw Error('confirmação perdida');
        return Response.json({}, {status:response});
      }
      return read?new Response(read,{headers:{'content-type':'image/png'}}):new Response(null,{status:404});
    };
    const reported=await publishSavedFrameImage({address,png},fetchImpl);
    assert.equal(Boolean(reported),verified);
    if(reported)assert.deepEqual(await reported.arrayBuffer(),await png.arrayBuffer());
    assert.deepEqual(calls,['POST','GET']);
  }
});

test('PNG legado usa o localizador exato e ausência é distinta de erro de leitura',async()=>{
  const legacy={...source,assetId:id(4)};
  assert.equal(await readSavedFrameImage(legacy,async()=>new Response(null,{status:404})),null);
  await assert.rejects(readSavedFrameImage(legacy,async()=>new Response(null,{status:503})),/image unavailable/);
  const png=image(1);
  assert.deepEqual(await (await readSavedFrameImage(legacy,async()=>new Response(png,{headers:{'content-type':'image/png'}}))).arrayBuffer(),await png.arrayBuffer());
});
