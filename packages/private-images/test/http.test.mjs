import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPrivateImageHandler } from '../src/index.mjs';

const user = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const piece = '33333333-3333-4333-8333-333333333333';
const asset = '44444444-4444-4444-8444-444444444444';
const base = new URL('https://compor.example/image');
for (const [k, v] of Object.entries({ projectId: project, pieceId: piece, version: '1', assetId: asset })) base.searchParams.set(k, v);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

test('imagem privada é ligada à versão autorizada e lida apenas com o token da pessoa', async () => {
  const requests = [];
  const handler = createPrivateImageHandler({ appOrigin: 'https://compor.example', supabaseUrl: 'https://project.supabase.co', publishableKey: 'sb_publishable_test', authenticate: async () => ({ userId: user, token: 'user-token' }), fetch: async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.headers.authorization, 'Bearer user-token');
    if (url.pathname === '/rest/v1/piece_versions') return Response.json([{ project_id: project, piece_id: piece, version: 1, projects: { owner_id: user } }]);
    if (init.method === 'POST') return Response.json({});
    return new Response(png, { headers: { 'content-type': 'image/png' } });
  } });
  const post = await handler(new Request(base, { method: 'POST', headers: { origin: 'https://compor.example', 'content-type': 'image/png' }, body: png }));
  assert.equal(post.status, 201);
  assert.deepEqual(await post.json(), { status: 'stored', assetId: asset });
  assert.equal(requests[1].url.pathname, `/storage/v1/object/compor-project-images/${user}/${project}/${piece}/1/${asset}.png`);
  assert.equal(requests[1].init.headers['x-upsert'], 'false');
  const get = await handler(new Request(base));
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('cache-control'), 'no-store');
  assert.equal(get.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), png);
});

test('outra conta e versão inexistente não acessam o Storage', async () => {
  let storageCalls = 0;
  const handler = createPrivateImageHandler({ appOrigin: 'https://compor.example', supabaseUrl: 'https://project.supabase.co', publishableKey: 'sb_publishable_test', authenticate: async () => ({ userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', token: 'other-token' }), fetch: async url => {
    if (url.pathname.startsWith('/storage/')) storageCalls++;
    return Response.json([{ project_id: project, piece_id: piece, version: 1, projects: { owner_id: user } }]);
  } });
  const response = await handler(new Request(base));
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /other-token|11111111/);
  assert.equal(storageCalls, 0);
});

test('upload interrompido é incerto e colisão nunca sobrescreve ou repete automaticamente', async () => {
  let uploads = 0;
  const handler = createPrivateImageHandler({ appOrigin: 'https://compor.example', supabaseUrl: 'https://project.supabase.co', publishableKey: 'sb_publishable_test', authenticate: async () => ({ userId: user, token: 'user-token' }), fetch: async (url, init) => {
    if (url.pathname === '/rest/v1/piece_versions') return Response.json([{ project_id: project, piece_id: piece, version: 1, projects: { owner_id: user } }]);
    uploads++;
    assert.equal(init.headers['x-upsert'], 'false');
    if (uploads === 1) throw Error('user-token');
    return new Response('private storage message', { status: 409 });
  } });
  const request = () => new Request(base, { method: 'POST', headers: { origin: 'https://compor.example', 'content-type': 'image/png' }, body: png });
  const uncertain = await handler(request());
  assert.equal(uncertain.status, 502);
  assert.deepEqual(await uncertain.json(), { error: 'result_unknown', retryAutomatically: false });
  assert.equal(uploads, 1);
  const collision = await handler(request());
  assert.equal(collision.status, 409);
  assert.deepEqual(await collision.json(), { error: 'asset_exists', retryAutomatically: false });
  assert.equal(uploads, 2);
});

test('rejeita origem, tipo, tamanho e PNG inválidos sem acessar serviços externos', async () => {
  let calls = 0;
  const handler = createPrivateImageHandler({ appOrigin: 'https://compor.example', supabaseUrl: 'https://project.supabase.co', publishableKey: 'sb_publishable_test', authenticate: async () => ({ userId: user, token: 'user-token' }), fetch: async () => { calls++; throw Error(); } });
  const post = (body, origin = 'https://compor.example', type = 'image/png') => handler(new Request(base, { method: 'POST', headers: { origin, 'content-type': type }, body }));
  assert.equal((await post(png, 'https://evil.example')).status, 403);
  assert.equal((await post(png, 'https://compor.example', 'image/jpeg')).status, 400);
  assert.equal((await post(Buffer.alloc(8 * 1024 * 1024 + 1))).status, 400);
  assert.equal((await post(Buffer.from('not a PNG'))).status, 400);
  assert.equal(calls, 0);
});

test('credencial administrativa não é aceita na configuração', () => {
  assert.throws(() => createPrivateImageHandler({ appOrigin: 'https://compor.example', supabaseUrl: 'https://project.supabase.co', publishableKey: 'sb_secret_test', authenticate: async () => null }), /invalid configuration/);
});

test('resposta de Storage com MIME incorreto não é devolvida como imagem', async () => {
  const handler = createPrivateImageHandler({ appOrigin: 'https://compor.example', supabaseUrl: 'https://project.supabase.co', publishableKey: 'sb_publishable_test', authenticate: async () => ({ userId: user, token: 'user-token' }), fetch: async url => {
    if (url.pathname === '/rest/v1/piece_versions') return Response.json([{ project_id: project, piece_id: piece, version: 1, projects: { owner_id: user } }]);
    return new Response(png, { headers: { 'content-type': 'image/png-attacker' } });
  } });
  const result = await handler(new Request(base));
  assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /user-token/);
});

test('PNG maior que limite Vercel é recuperado em partes com autorização por requisição', async () => {
 const large=Buffer.concat([png,Buffer.alloc(5*1024*1024,7)]),digest=createHash('sha256').update(large).digest('hex');let authenticatedUser=user,checks=0,storage=0;
 const handler=createPrivateImageHandler({appOrigin:'https://compor.example',supabaseUrl:'https://project.supabase.co',publishableKey:'sb_publishable_test',authenticate:async()=>({userId:authenticatedUser,token:'user-token'}),fetch:async(url,init)=>{
  if(url.pathname==='/rest/v1/piece_versions'){checks++;return Response.json([{project_id:project,piece_id:piece,version:1,projects:{owner_id:user}}]);}
  storage++;assert.equal(init.headers.authorization,'Bearer user-token');return new Response(large,{headers:{'content-type':'image/png'}});
 }});
 const full=await handler(new Request(base));assert.equal(full.status,413);assert.equal(full.headers.get('x-compor-chunked'),'1');
 const chunks=[];for(let i=0;i<3;i++){const url=new URL(base);url.searchParams.set('part',String(i));const r=await handler(new Request(url));assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/octet-stream');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-compor-part'),String(i));assert.equal(r.headers.get('x-compor-parts'),'3');assert.equal(r.headers.get('x-compor-size'),String(large.length));assert.equal(r.headers.get('x-compor-sha256'),digest);const bytes=Buffer.from(await r.arrayBuffer());assert.ok(bytes.length<=2*1024*1024);chunks.push(bytes);}
 assert.deepEqual(Buffer.concat(chunks),large);assert.equal(checks,4);assert.equal(storage,4);
 authenticatedUser='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const unauthorized=new URL(base);unauthorized.searchParams.set('part','0');assert.equal((await handler(new Request(unauthorized))).status,404);assert.equal(storage,4);
 const invalid=new URL(base);invalid.searchParams.set('part','4');assert.equal((await handler(new Request(invalid))).status,400);assert.equal(storage,4);
});

test('JPEG exige opt-in para escrita, é ligado à lâmina salva e preserva os bytes', async () => {
  const jpegUrl = new URL(base);
  jpegUrl.searchParams.set('format', 'jpeg');
  const bytes = Buffer.from([255, 216, 42, 255, 217]);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const frameId = '55555555-5555-4555-8555-555555555555';
  let stored, uploads = 0, downloads = 0, checks = 0, validations = 0;
  const options = {
    appOrigin: 'https://compor.example', supabaseUrl: 'https://project.supabase.co', publishableKey: 'sb_publishable_test',
    authenticate: async () => ({ userId: user, token: 'user-token' }),
    validateCarouselJpeg: async image => {
      validations += 1;
      assert.deepEqual(image, bytes);
      return true;
    },
    fetch: async (url, init) => {
      assert.equal(init.headers.authorization, 'Bearer user-token');
      if (url.pathname === '/rest/v1/piece_versions') {
        checks += 1;
        assert.match(url.searchParams.get('select'), /,content$/);
        return Response.json([{
          project_id: project, piece_id: piece, version: 1, projects: { owner_id: user },
          content: {
            format: 'carousel', frames: [{ id: frameId, assetId: asset, position: 1 }],
            carouselRender: { planSha256: '5'.repeat(64), frames: [{ frameId, sha256, alt: 'Abertura.' }] },
          },
        }]);
      }
      assert.match(url.pathname, new RegExp('/compor-carousel-jpegs/' + user + '/' + project + '/' + piece + '/1/' + asset + '[.]jpg$'));
      if (init.method === 'POST') {
        uploads += 1;
        assert.equal(init.headers['content-type'], 'image/jpeg');
        assert.equal(init.headers['x-upsert'], 'false');
        stored = init.body;
        return Response.json({});
      }
      downloads += 1;
      return new Response(stored, { headers: { 'content-type': 'image/jpeg' } });
    },
  };
  const post = (body = bytes) => new Request(jpegUrl, { method: 'POST', headers: { origin: 'https://compor.example', 'content-type': 'image/jpeg' }, body });
  const readOnly = createPrivateImageHandler(options);
  const readWrite = createPrivateImageHandler({ ...options, allowCarouselJpegUploads: true });
  assert.equal((await readOnly(post())).status, 503);
  assert.equal(checks, 0);
  assert.equal((await readWrite(post(Buffer.from([255, 216, 41, 255, 217])))).status, 400);
  assert.equal((await readWrite(post(Buffer.alloc(4 * 1024 * 1024 + 1)))).status, 400);
  assert.equal(uploads, 0);
  assert.equal(validations, 0);
  assert.equal((await readWrite(post())).status, 201);
  const result = await readOnly(new Request(jpegUrl));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('content-type'), 'image/jpeg');
  assert.ok(Buffer.from(await result.arrayBuffer()).equals(bytes));
  stored = Buffer.from([255, 216, 40, 255, 217]);
  assert.equal((await readOnly(new Request(jpegUrl))).status, 503);
  assert.equal(uploads, 1);
  assert.equal(downloads, 2);
  assert.equal(validations, 2);
});

test('JPEG de versão comum, de lâmina sem vínculo ou de outra conta não chega ao Storage', async () => {
  const jpegUrl = new URL(base);
  jpegUrl.searchParams.set('format', 'jpeg');
  const frameId = '55555555-5555-4555-8555-555555555555';
  const read = row => createPrivateImageHandler({
    appOrigin: 'https://compor.example', supabaseUrl: 'https://project.supabase.co', publishableKey: 'sb_publishable_test',
    authenticate: async () => ({ userId: user, token: 'user-token' }),
    validateCarouselJpeg: async () => true,
    fetch: async url => {
      assert.equal(url.pathname, '/rest/v1/piece_versions');
      return Response.json([{ project_id: project, piece_id: piece, version: 1, projects: { owner_id: user }, ...row }]);
    },
  })(new Request(jpegUrl));
  const content = {
    format: 'carousel', frames: [{ id: frameId, assetId: asset, position: 1 }],
    carouselRender: { planSha256: '5'.repeat(64), frames: [] },
  };
  assert.equal((await read({})).status, 404);
  assert.equal((await read({ content, projects: { owner_id: project } })).status, 404);
  assert.equal((await read({ content })).status, 404);
  assert.equal((await read({ content: { ...content, format: 'collection' } })).status, 404);
});
