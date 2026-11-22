import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const alice = '11111111-1111-4111-8111-111111111111', bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project = '22222222-2222-4222-8222-222222222222', piece = '33333333-3333-4333-8333-333333333333';
const frame1 = '44444444-4444-4444-8444-444444444444', frame2 = '55555555-5555-4555-8555-555555555555';
const asset1 = '66666666-6666-4666-8666-666666666666', asset2 = '77777777-7777-4777-8777-777777777777';
const baseContent = { headline: 'Capa do carrossel', price: '', date: '', caption: 'Legenda complementar', captionOrigin: 'agent' };

test('formatos e lâminas preservam versões legadas, herança v3, validação estrita e RLS', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to public;grant execute on function auth.uid() to public;`);
  for (const name of [
    '20261103000000_projects.sql',
    '20261103000001_piece_versions.sql',
    '20261105000014_version_metadata.sql',
    '20261106000021_piece_dynamic_fields.sql',
    '20261109000027_variant_metadata.sql',
    '20261121000047_post_formats_and_frames.sql',
  ]) {
    await db.exec(await readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8'));
  }
  await db.query('insert into auth.users(id) values($1),($2)', [alice, bob]);
  await db.query("insert into public.projects(id,owner_id,title) values($1,$2,'Alice')", [project, alice]);
  const asUser = async id => db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);
  const saveV3 = async (expected, base, content, op = null, dim = null) =>
    (await db.query('select public.save_piece_version_v3($1,$2,$3,$4,$5,$6,$7) as result', [project, piece, expected, base, content, op, dim])).rows[0].result;

  await asUser(alice);
  // 1. Legado sem format/frames continua válido
  assert.equal((await saveV3(0, 0, baseContent)).status, 'saved');

  // 2. Story 9:16 sem frames
  const storyContent = { ...baseContent, format: 'story' };
  const savedStory = await saveV3(1, 1, storyContent, 'create', null);
  assert.equal(savedStory.status, 'saved');
  assert.equal(savedStory.version.content.format, 'story');

  // 3. Carrossel com 2+ lâminas e assetId preservado ao retocar apenas 1 lâmina
  const carouselV1 = {
    ...baseContent,
    format: 'carousel',
    visualInvariants: 'Fundo creme, fonte grotesca preta, detalhe terracota',
    frames: [
      { id: frame1, position: 1, role: 'capa', headline: 'Pare de perder alcance', body: 'O erro nos primeiros 2 segundos.', visualCue: 'Close celular', assetId: asset1 },
      { id: frame2, position: 2, role: 'mecanismo', headline: 'O detalhe?', body: 'Hierarquia legível a 360px.', visualCue: 'Comparativo lado a lado', assetId: null },
    ],
  };
  const savedCarousel = await saveV3(2, 2, carouselV1, 'create', 'composition');
  assert.equal(savedCarousel.status, 'saved');
  assert.equal(savedCarousel.version.metadata.approval.status, 'unapproved');
  assert.deepEqual(savedCarousel.version.content, carouselV1);

  // Aprova v3 e retoca lâmina 2 preservando asset1 na lâmina 1
  await db.query('select public.approve_piece_version($1,$2,3,0)', [project, piece]);
  const carouselV2 = {
    ...carouselV1,
    frames: [carouselV1.frames[0], { ...carouselV1.frames[1], assetId: asset2 }],
  };
  const retouch = await saveV3(3, 3, carouselV2, 'edit', null);
  assert.equal(retouch.status, 'saved');
  assert.equal(retouch.version.metadata.approval.kind, 'inherited');
  assert.equal(retouch.version.content.frames[0].assetId, asset1);
  assert.equal(retouch.version.content.frames[1].assetId, asset2);

  // 4. Coleção 2+ fotos
  const collectionContent = { ...carouselV2, format: 'collection' };
  assert.equal((await saveV3(4, 4, collectionContent, 'create', null)).status, 'saved');

  // 5. Rejeita formatos e lâminas inválidas
  for (const invalid of [
    { ...baseContent, format: 'banner' },
    { ...baseContent, format: 'story', frames: carouselV1.frames },
    { ...baseContent, format: 'single', frames: carouselV1.frames },
    { ...baseContent, format: 'carousel', frames: [carouselV1.frames[0]] },
    { ...baseContent, format: 'carousel', frames: [{ ...carouselV1.frames[0], id: 'bad-id' }, carouselV1.frames[1]] },
    { ...baseContent, format: 'carousel', frames: [carouselV1.frames[0], { ...carouselV1.frames[1], id: frame1 }] },
    { ...baseContent, format: 'carousel', frames: [carouselV1.frames[0], { ...carouselV1.frames[1], position: 1 }] },
    { ...baseContent, format: 'carousel', frames: [carouselV1.frames[0], { ...carouselV1.frames[1], extra: 'nope' }] },
    { ...baseContent, format: 'carousel', frames: [carouselV1.frames[0], { ...carouselV1.frames[1], body: 'sk-segredo' }] },
    { ...baseContent, format: 'carousel', visualInvariants: 'sk-segredo' },
  ]) {
    await assert.rejects(() => saveV3(5, 5, invalid));
  }

  // 6. RLS isola Bob e anon
  await asUser(bob);
  assert.deepEqual(await saveV3(5, 5, collectionContent), { status: 'not_found' });
  await db.exec('set role anon');
  await assert.rejects(() => saveV3(5, 5, collectionContent));
});
