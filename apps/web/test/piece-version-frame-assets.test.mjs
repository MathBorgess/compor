import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {frameVersionAssetId, prepareSavedFrameImages, publishSavedFrameImage, readSavedFrameImage} from '../lib/piece-version-frame-assets.ts';
import {pieceContentSchema, pieceFrameSchema} from '../lib/studio-domain.ts';

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

test('lâminas governadas exigem JPEGs do recibo e os preservam na versão', async () => {
  const frames = Array.from({length: 3}, (_, index) => ({
    id: id(index + 3), position: index + 1, role: 'lâmina', headline: 'Atenção', body: '', visualCue: '', assetId: null,
  }));
  const buffers = await Promise.all(frames.map(frame =>
    sharp({create: {width: 1080, height: 1350, channels: 3, background: {r: 25 * frame.position, g: 0, b: 80}}})
      .withIccProfile('srgb').jpeg({quality: 92, chromaSubsampling: '4:4:4'}).toBuffer()));
  const images = new Map(frames.map((frame, index) => [frame.id, new Blob([buffers[index]], {type: 'image/jpeg'})]));
  const carouselPlan = {mode: 'native_serial', slides: frames.map(frame => ({frameId: frame.id, layout: 'native_serial', alt: 'Texto.'}))};
  const carouselRender = {planSha256: 'a'.repeat(64), frames: frames.map((frame, index) => ({
    frameId: frame.id, sha256: createHash('sha256').update(buffers[index]).digest('hex'), alt: 'Texto.',
  }))};
  const content = pieceContentSchema.parse({format: 'carousel', headline: '', price: '', date: '',
    caption: 'Legenda.', captionOrigin: 'user', frames, carouselPlan, carouselRender});
  const prepare = () => prepareSavedFrameImages({version: source, content, readFrame: async frame => images.get(frame.id) ?? null});
  const result = await prepare();
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.content.carouselRender, carouselRender);
  const [{address, jpeg}] = result.images;
  assert.strictEqual(jpeg, images.get(frames[0].id));
  assert.equal(result.content.frames[0].assetId, address.assetId);
  assert.equal(address.expectedSha256, carouselRender.frames[0].sha256);
  assert.notEqual(address.assetId, await frameVersionAssetId(source, new Blob([buffers[0]], {type: 'image/png'})));

  for (const response of [jpeg, images.get(frames[1].id)]) {
    const calls = [];
    const saved = await publishSavedFrameImage(result.images[0], async (path, options) => {
      const target = new URL(path, 'https://compor.test');
      assert.equal(target.searchParams.get('format'), 'jpeg');
      assert.equal(target.searchParams.get('assetId'), address.assetId);
      calls.push(options.method ?? 'GET');
      if (options.method === 'POST') {
        assert.equal(options.headers['content-type'], 'image/jpeg');
        assert.strictEqual(options.body, jpeg);
        return Response.json({}, {status: 409});
      }
      return new Response(response, {headers: {'content-type': 'image/jpeg'}});
    });
    assert.equal(Boolean(saved), response === jpeg);
    assert.deepEqual(calls, ['POST', 'GET']);
  }

  images.set(frames[0].id, images.get(frames[1].id));
  assert.deepEqual(await prepare(), {status: 'image_unsupported'});
  images.set(frames[0].id, new Blob([buffers[0]], {type: 'image/png'}));
  assert.deepEqual(await prepare(), {status: 'image_unsupported'});
  images.delete(frames[0].id);
  assert.deepEqual(await prepare(), {status: 'image_unsupported'});
});
