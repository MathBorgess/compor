import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const project = '33333333-3333-4333-8333-333333333333';
const otherProject = '44444444-4444-4444-8444-444444444444';
const piece = '55555555-5555-4555-8555-555555555555';
const pngId = '66666666-6666-4666-8666-666666666666';
const jpegBucket = 'compor-carousel-jpegs';
const pngBucket = 'compor-project-images';

const legacy = { headline: 'A primeira versão', price: '', date: '', caption: '', captionOrigin: 'user' };
const frameId = index => `77777777-7777-4777-8777-77777777777${index}`;
const jpegId = index => `88888888-8888-5888-8888-88888888888${index}`;
const headlines = ['Seu texto cabe na capa?', 'Aumente a escala do texto', 'Salve para a próxima edição'];
const recipes = [
  { layout: 'hero_bleed', alt: 'A capa pergunta se o texto cabe.' },
  { layout: 'comparison_dual', alt: 'Comparação do mesmo título em duas escalas.',
    diagram: { type: 'type_scale', labels: ['Texto menor', 'Texto maior'], sample: 'Ação' } },
  { layout: 'cta_closing', alt: 'A última lâmina pede que o leitor salve o guia.' },
];

function governedContent() {
  return {
    ...legacy,
    format: 'carousel',
    caption: 'Contraste, “escala” e "ação". #compor',
    frames: headlines.map((headline, offset) => ({
      id: frameId(offset + 1), position: offset + 1, role: 'Insight', headline,
      body: offset === 1 ? 'Revise o título.\nLeia de novo.' : '',
      visualCue: 'Paleta clara', assetId: null,
    })),
    carouselPlan: {
      mode: 'editorial_art',
      tokens: { accent: '#FFE777' },
      slides: recipes.map((recipe, offset) => ({ ...structuredClone(recipe), frameId: frameId(offset + 1) })),
    },
  };
}

function renderedContent(draft) {
  const content = structuredClone(draft);
  const ordered = [...draft.frames].sort((a, b) => a.position - b.position);
  const slides = ordered.map(frame => {
    const { frameId: id, ...visual } = draft.carouselPlan.slides.find(recipe => recipe.frameId === frame.id);
    return { ...visual, id, headline: frame.headline, ...(frame.body && { body: frame.body }) };
  });
  const canonical = JSON.stringify({ ...draft.carouselPlan, caption: draft.caption, slides }, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : Number(a > b)))
      : value);
  content.frames.forEach(frame => { frame.assetId = jpegId(frame.position); });
  content.carouselRender = {
    planSha256: createHash('sha256').update(canonical).digest('hex'),
    frames: ordered.map((frame, offset) => ({
      frameId: frame.id, sha256: 'a'.repeat(63) + (offset + 1), alt: slides[offset].alt,
    })),
  };
  return content;
}

async function migrate(db, names) {
  for (const name of names) {
    await db.exec(await readFile(new URL('../../../supabase/migrations/' + name + '.sql', import.meta.url), 'utf8'));
  }
}

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth, public, storage to public;
    grant execute on function auth.uid() to public;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text references storage.buckets(id), name text not null, primary key(bucket_id, name));
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated, anon;
    create policy prior_broad_policy on storage.objects for all to public using (true) with check (true);
    insert into storage.buckets values ('other-bucket','other-bucket',false,null,null);
    insert into storage.objects values ('other-bucket','unrelated.png');
  `);
  await migrate(db, [
    '20261103000000_projects',
    '20261103000001_piece_versions',
    '20261103000003_private_project_images',
    '20261105000014_version_metadata',
    '20261106000021_piece_dynamic_fields',
    '20261109000027_variant_metadata',
    '20261121000047_post_formats_and_frames',
  ]);
  await db.query('insert into auth.users(id) values($1),($2)', [alice, bob]);
  await db.query("insert into public.projects(id,owner_id,title) values($1,$2,'Alice'),($3,$4,'Bob')",
    [project, alice, otherProject, bob]);
  return db;
}

async function identify(db, actor, role = 'authenticated') {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor ?? '']);
}

const writeObject = (db, bucket, name) => db.query(
  'insert into storage.objects(bucket_id,name) values($1,$2)', [bucket, name]);
const storagePath = (actor, projectId, version, file) => `${actor}/${projectId}/${piece}/${version}/${file}`;

function save(db, expected, base, value, projectId = project) {
  return db.query('select public.save_piece_version_v3($1,$2,$3,$4,$5,null,null) result',
    [projectId, piece, expected, base, value]).then(({ rows }) => rows[0].result);
}

test('migração vincula composição, CAS e RLS JPEG e preserva versões e objetos PNG', async t => {
  const db = await fixture(t);
  const pngName = storagePath(alice, project, 1, pngId + '.png');
  await identify(db, alice);
  assert.equal((await save(db, 0, 0, legacy)).status, 'saved');
  await writeObject(db, pngBucket, pngName);

  await db.exec('reset role');
  await migrate(db, ['20261122000048_carousel_composition']);
  const { rows: buckets } = await db.query('select id,public,file_size_limit,allowed_mime_types from storage.buckets where id in ($1,$2) order by id',
    [jpegBucket, pngBucket]);
  assert.deepEqual(buckets, [
    { id: jpegBucket, public: false, file_size_limit: 4 * 1024 * 1024, allowed_mime_types: ['image/jpeg'] },
    { id: pngBucket, public: false, file_size_limit: 8 * 1024 * 1024, allowed_mime_types: ['image/png'] },
  ]);

  const draft = governedContent();
  // The ordinal field governs both the visual sequence and the receipt even when
  // the array of persisted frame rows is in a different order.
  draft.frames = [draft.frames[2], draft.frames[0], draft.frames[1]];
  const rendered = renderedContent(draft);
  const firstJpeg = jpegId(1) + '.jpg';
  const jpegName = storagePath(alice, project, 3, firstJpeg);
  await identify(db, alice);
  assert.deepEqual((await save(db, 1, 1, draft)).version.content, draft);
  await assert.rejects(writeObject(db, jpegBucket, storagePath(alice, project, 2, firstJpeg)), { code: '42501' });

  const racing = await Promise.all([save(db, 2, 2, rendered), save(db, 2, 2, rendered)]);
  assert.deepEqual(racing.map(result => result.status).sort(), ['conflict', 'saved']);
  const saved = racing.find(result => result.status === 'saved').version;
  assert.equal(saved.version, 3);
  assert.equal(saved.metadata.baseVersion, 2);
  assert.deepEqual(saved.content, rendered);
  assert.deepEqual(racing.find(result => result.status === 'conflict'), { status: 'conflict', currentVersion: 3 });

  const history = await db.query('select public.list_project_piece_versions_v3($1) result', [project]);
  assert.deepEqual(history.rows[0].result.map(version => version.content), [legacy, draft, rendered]);
  await assert.rejects(db.query('update public.piece_versions set content=$1', [legacy]), { code: '42501' });
  await assert.rejects(writeObject(db, jpegBucket, storagePath(alice, project, 4, firstJpeg)), { code: '42501' });
  await assert.rejects(writeObject(db, jpegBucket, storagePath(alice, project, 3, pngId + '.jpg')), { code: '42501' });
  await assert.rejects(writeObject(db, jpegBucket, storagePath(alice, project, 3, jpegId(1) + '.png')), { code: '42501' });
  await writeObject(db, jpegBucket, jpegName);
  await assert.rejects(writeObject(db, jpegBucket, jpegName), { code: '23505' });
  assert.equal((await db.query("update storage.objects set name='renamed.jpg' where bucket_id=$1", [jpegBucket])).affectedRows, 0);
  assert.equal((await db.query('delete from storage.objects where bucket_id=$1', [jpegBucket])).affectedRows, 0);
  await assert.rejects(db.query('update storage.objects set bucket_id=$1,name=$2 where bucket_id=$3',
    [jpegBucket, storagePath(alice, project, 3, jpegId(2) + '.jpg'), 'other-bucket']), { code: '42501' });

  const owned = await db.query('select bucket_id,name from storage.objects order by bucket_id');
  assert.deepEqual(owned.rows, [
    { bucket_id: jpegBucket, name: jpegName },
    { bucket_id: pngBucket, name: pngName },
    { bucket_id: 'other-bucket', name: 'unrelated.png' },
  ]);

  const secondPng = storagePath(alice, project, 1, '99999999-9999-4999-8999-999999999999.png');
  await writeObject(db, pngBucket, secondPng);
  assert.deepEqual((await db.query('select name from storage.objects where bucket_id=$1 order by name', [pngBucket])).rows,
    [{ name: pngName }, { name: secondPng }]);

  await identify(db, bob);
  assert.deepEqual(await save(db, 3, 3, rendered), { status: 'not_found' });
  await assert.rejects(db.query('select public.list_project_piece_versions_v3($1) result', [project]),
    { code: '42501', message: 'not_found' });
  await assert.rejects(writeObject(db, jpegBucket, jpegName), { code: '42501' });
  await assert.rejects(writeObject(db, jpegBucket, storagePath(bob, project, 3, firstJpeg)), { code: '42501' });
  assert.equal((await db.query('select name from storage.objects where bucket_id in ($1,$2)', [jpegBucket, pngBucket])).rows.length, 0);
  assert.equal((await save(db, 0, 0, rendered, otherProject)).status, 'saved');
  const bobJpeg = storagePath(bob, otherProject, 1, firstJpeg);
  await writeObject(db, jpegBucket, bobJpeg);
  assert.deepEqual((await db.query('select name from storage.objects where bucket_id=$1', [jpegBucket])).rows, [{ name: bobJpeg }]);

  await identify(db, null);
  await assert.rejects(writeObject(db, jpegBucket, jpegName), { code: '42501' });
  assert.equal((await db.query('select name from storage.objects where bucket_id=$1', [jpegBucket])).rows.length, 0);

  // A stale authenticated JWT claim alone does not grant anonymous access.
  await identify(db, alice, 'anon');
  await assert.rejects(save(db, 3, 3, rendered), { code: '42501' });
  await assert.rejects(writeObject(db, jpegBucket, jpegName), { code: '42501' });
  assert.deepEqual((await db.query('select name from storage.objects')).rows, [{ name: 'unrelated.png' }]);
});

test('associa o SHA do raster ao plano sem alterar versões gravadas antes da migração', async t => {
  const db = await fixture(t);
  await migrate(db, ['20261122000048_carousel_composition']);
  const original = renderedContent(governedContent());
  await identify(db, alice);
  assert.equal((await save(db, 0, 0, original)).status, 'saved');
  await db.exec('reset role');
  await migrate(db, ['20261123000049_carousel_art_source']);
  await identify(db, alice);
  const art = 'a'.repeat(64);
  const draft = governedContent();
  draft.carouselPlan.slides[0].artSha256 = art;
  const stale = { ...original, carouselPlan: draft.carouselPlan };
  await assert.rejects(save(db, 1, 1, stale), { code: '22023' });
  const rendered = renderedContent(draft);
  const replaced = structuredClone(rendered);
  replaced.carouselPlan.slides[0].artSha256 = 'b'.repeat(64);
  await assert.rejects(save(db, 1, 1, replaced), { code: '22023' });
  const bodies = [
    content => { content.carouselPlan.slides[0].artSha256 = 'A'.repeat(64); },
    content => { content.carouselPlan.slides[0].artSha256 = null; },
    content => { content.carouselPlan.slides[0].art = 'data:image/png;base64,AA=='; },
    content => { content.carouselPlan.slides[1].artSha256 = art; },
    content => { content.carouselPlan.slides[2].artSha256 = art; },
  ];
  for (const alter of bodies) {
    const invalid = structuredClone(draft);
    alter(invalid);
    await assert.rejects(save(db, 1, 1, renderedContent(invalid)), { code: '22023' });
  }
  assert.equal((await save(db, 1, 1, rendered)).status, 'saved');
  const { rows } = await db.query('select content from public.piece_versions where project_id=$1 order by version', [project]);
  assert.deepEqual(rows.map(row => row.content), [original, rendered]);
});

test('preserva diagramas anteriores e vincula os diagramas semânticos ao recibo JPEG', async t => {
  const db = await fixture(t);
  await migrate(db, ['20261122000048_carousel_composition', '20261123000049_carousel_art_source']);
  const legacyRendered = renderedContent(governedContent());
  const categories = governedContent();
  categories.carouselPlan.slides[1].diagram = {
    type: 'category_split', labels: ['Até 1,5 mm', 'Acima disso'], items: ['Folha fina', 'Papel reforçado'],
  };
  const orientation = governedContent();
  orientation.carouselPlan.slides[1].diagram = {
    type: 'orientation', labels: ['Em pé', 'De cabeça para baixo'], sample: 'Margem de 1,5 mm',
  };
  const closing = governedContent();
  closing.carouselPlan.slides[2].diagram = {
    type: 'hierarchy', labels: ['Peso igual', 'Título em destaque'], items: ['Título', 'Data', 'Local'],
  };
  closing.frames[2].headline = 'Dê destaque ao título';
  closing.frames[2].body = 'Salve para revisar seu próximo anúncio.';
  await identify(db, alice);
  assert.equal((await save(db, 0, 0, legacyRendered)).status, 'saved');
  await assert.rejects(save(db, 1, 1, categories), { code: '22023' });

  await db.exec('reset role');
  await migrate(db, ['20261123000050_carousel_semantic_diagrams']);
  await identify(db, alice);
  const categoriesRendered = renderedContent(categories);
  const orientationRendered = renderedContent(orientation);
  const closingRendered = renderedContent(closing);
  const malformed = [
    [categories, { items: ['Trocar plantão'] }],
    [categories, { items: ['Sim', ' sim '] }],
    [categories, { items: ['A B C D E', 'Onde anotar?'] }],
    [categories, { labels: ['Um A B C', 'Dúvida'] }],
    [categories, { labels: ['Dúvida', ' dúvida '] }],
    [categories, { labels: ['Dúvida', 'Du\u0301vida'] }],
    [categories, { sample: 'Outro' }],
    [orientation, { labels: ['De cabeça para baixo', 'Em pé'] }],
    [orientation, { labels: ['Esquerda', 'Direita'] }],
    [orientation, { sample: 'Este A B C D' }],
    [orientation, { sample: 'A'.repeat(19) }],
    [orientation, { sample: 'Página <br>' }],
    [orientation, { items: ['Página 7', 'Página 9'] }],
  ];
  for (const [plan, fields] of malformed) {
    const invalid = structuredClone(plan);
    Object.assign(invalid.carouselPlan.slides[1].diagram, fields);
    await assert.rejects(save(db, 1, 1, invalid), { code: '22023' }, JSON.stringify(fields));
  }
  const incompatibleLayout = structuredClone(orientation);
  incompatibleLayout.carouselPlan.slides[1].layout = 'bento_grid';
  await assert.rejects(save(db, 1, 1, incompatibleLayout), { code: '22023' });
  const stale = structuredClone(categoriesRendered);
  stale.carouselPlan.slides[1].diagram.items[1] = 'Onde guardar?';
  await assert.rejects(save(db, 1, 1, stale), { code: '22023' });

  assert.deepEqual((await save(db, 1, 1, categoriesRendered)).version.content, categoriesRendered);
  assert.deepEqual((await save(db, 2, 2, orientationRendered)).version.content, orientationRendered);
  const staleClosing = structuredClone(closingRendered);
  staleClosing.carouselPlan.slides[2].diagram.items[0] = 'Oferta';
  await assert.rejects(save(db, 3, 3, staleClosing), { code: '22023' });
  assert.deepEqual((await save(db, 3, 3, closingRendered)).version.content, closingRendered);
  const { rows } = await db.query('select content from public.piece_versions where project_id=$1 order by version', [project]);
  assert.deepEqual(rows.map(row => row.content), [legacyRendered, categoriesRendered, orientationRendered, closingRendered]);
});

test('matriz de leitura nativa aceita receita fixa e vincula o JPEG à versão isolada', async t => {
  const db = await fixture(t);
  await migrate(db, [
    '20261122000048_carousel_composition',
    '20261123000049_carousel_art_source',
    '20261123000050_carousel_semantic_diagrams',
  ]);
  const previous = governedContent();
  previous.carouselPlan.slides[1].diagram = {
    type: 'orientation', labels: ['Em pé', 'De cabeça para baixo'], sample: 'Página 2',
  };
  const previousRendered = renderedContent(previous);
  const typographic = governedContent();
  typographic.carouselPlan.mode = 'native_serial';
  typographic.carouselPlan.slides[1] = {
    frameId: frameId(2), layout: 'native_serial', alt: 'Um teste de leitura para a prévia do feed.',
  };
  const matrix = { type: 'readability_matrix' };
  const shortMatrix = structuredClone(typographic);
  shortMatrix.carouselPlan.slides[1].diagram = matrix;
  const draft = structuredClone(shortMatrix);
  const closing = draft.frames[2];
  draft.frames[2] = { ...closing, headline: 'Confira o contraste' };
  draft.frames.push({ ...closing, id: frameId(4), position: 4 });
  draft.carouselPlan.slides[2] = { frameId: frameId(3), layout: 'native_serial', alt: 'Um teste de contraste para a prévia.' };
  draft.carouselPlan.slides.push({ ...recipes[2], frameId: frameId(4) });
  await identify(db, alice);
  assert.equal((await save(db, 0, 0, previousRendered)).status, 'saved');
  await assert.rejects(save(db, 1, 1, draft), { code: '22023' });
  await db.exec('reset role');
  await migrate(db, ['20261123000051_carousel_readability_matrix']);
  await identify(db, alice);
  await assert.rejects(save(db, 1, 1, shortMatrix), { code: '22023' });
  await assert.rejects(save(db, 1, 1, renderedContent(shortMatrix)), { code: '22023' });
  const typographicRendered = renderedContent(typographic);
  assert.deepEqual((await save(db, 1, 1, typographicRendered)).version.content, typographicRendered);

  for (const fields of [
    { layout: 'comparison_dual' },
    { artSha256: 'a'.repeat(64) },
    { diagram: 'readability_matrix' },
    { diagram: { ...matrix, labels: ['Escala', 'Contraste'] } },
    { diagram: { ...matrix, sample: 'Oferta' } },
    { diagram: { ...matrix, items: ['Oferta', 'Detalhes'] } },
    { diagram: { ...matrix, color: null } },
  ]) {
    const invalid = structuredClone(draft);
    Object.assign(invalid.carouselPlan.slides[1], fields);
    await assert.rejects(save(db, 2, 2, renderedContent(invalid)), { code: '22023' }, JSON.stringify(fields));
  }
  const wrongMode = structuredClone(draft);
  wrongMode.carouselPlan.mode = 'editorial_art';
  await assert.rejects(save(db, 2, 2, renderedContent(wrongMode)), { code: '22023' });
  const rendered = renderedContent(draft);
  const stale = structuredClone(rendered);
  delete stale.carouselPlan.slides[1].diagram;
  await assert.rejects(save(db, 2, 2, stale), { code: '22023' });

  assert.deepEqual((await save(db, 2, 2, draft)).version.content, draft);
  await db.exec('reset role');
  await migrate(db, ['20261123000052_carousel_spacing_diagram']);
  await identify(db, alice);
  await assert.rejects(save(db, 3, 3, renderedContent(shortMatrix)), { code: '22023' });
  assert.deepEqual((await save(db, 3, 3, rendered)).version.content, rendered);
  const jpegName = storagePath(alice, project, 4, jpegId(2) + '.jpg');
  await writeObject(db, jpegBucket, jpegName);
  const history = await db.query('select public.list_project_piece_versions_v3($1) result', [project]);
  assert.deepEqual(history.rows[0].result.map(version => version.content), [previousRendered, typographicRendered, draft, rendered]);

  await identify(db, bob);
  assert.deepEqual(await save(db, 4, 4, rendered), { status: 'not_found' });
  await assert.rejects(writeObject(db, jpegBucket, jpegName), { code: '42501' });
  assert.deepEqual((await db.query('select name from storage.objects where bucket_id=$1', [jpegBucket])).rows, []);
});

test('diagrama de espaçamento editorial preserva o plano e o recibo com receita fechada', async t => {
  const db = await fixture(t);
  await migrate(db, [
    '20261122000048_carousel_composition',
    '20261123000049_carousel_art_source',
    '20261123000050_carousel_semantic_diagrams',
    '20261123000051_carousel_readability_matrix',
  ]);
  const previous = governedContent();
  const draft = structuredClone(previous);
  const spacing = { type: 'spacing' };
  Object.assign(draft.carouselPlan.slides[1], { layout: 'svg_diagram', diagram: spacing });
  const previousRendered = renderedContent(previous);

  await identify(db, alice);
  assert.deepEqual((await save(db, 0, 0, previousRendered)).version.content, previousRendered);
  await assert.rejects(save(db, 1, 1, draft), { code: '22023' });
  await db.exec('reset role');
  await migrate(db, ['20261123000052_carousel_spacing_diagram']);
  await identify(db, alice);

  for (const fields of [
    { layout: 'comparison_dual' },
    { layout: 'cta_closing' },
    { artSha256: 'a'.repeat(64) },
    { diagram: 'spacing' },
    { diagram: { ...spacing, labels: ['Sem espaçamento', 'Com espaçamento'] } },
    { diagram: { ...spacing, sample: 'Oferta' } },
    { diagram: { ...spacing, items: ['Oferta', 'Detalhes'] } },
    { diagram: { ...spacing, color: null } },
  ]) {
    const invalid = structuredClone(draft);
    Object.assign(invalid.carouselPlan.slides[1], fields);
    await assert.rejects(save(db, 1, 1, renderedContent(invalid)), { code: '22023' }, JSON.stringify(fields));
  }
  const wrongMode = structuredClone(draft);
  wrongMode.carouselPlan.mode = 'native_serial';
  await assert.rejects(save(db, 1, 1, renderedContent(wrongMode)), { code: '22023' });
  const rendered = renderedContent(draft);
  const stale = structuredClone(rendered);
  stale.carouselPlan.slides[1].diagram = 'steps';
  await assert.rejects(save(db, 1, 1, stale), { code: '22023' });

  assert.deepEqual((await save(db, 1, 1, draft)).version.content, draft);
  assert.deepEqual((await save(db, 2, 2, rendered)).version.content, rendered);
  const history = await db.query('select public.list_project_piece_versions_v3($1) result', [project]);
  assert.deepEqual(history.rows[0].result.map(version => version.content), [previousRendered, draft, rendered]);
});

test('diagramas de formas admitem só a receita editorial e vinculam o tipo ao recibo JPEG', async t => {
  const db = await fixture(t);
  await migrate(db, [
    '20261122000048_carousel_composition',
    '20261123000049_carousel_art_source',
    '20261123000050_carousel_semantic_diagrams',
    '20261123000051_carousel_readability_matrix',
    '20261123000052_carousel_spacing_diagram',
  ]);
  const spacing = governedContent();
  Object.assign(spacing.carouselPlan.slides[1], { layout: 'svg_diagram', diagram: { type: 'spacing' } });
  const spacingRendered = renderedContent(spacing);
  const types = ['shape_scale', 'shape_grouping'];
  const drafts = types.map(type => {
    const draft = governedContent();
    Object.assign(draft.carouselPlan.slides[1], { layout: 'split_horizontal', diagram: { type } });
    return draft;
  });

  await identify(db, alice);
  assert.deepEqual((await save(db, 0, 0, legacy)).version.content, legacy);
  assert.deepEqual((await save(db, 1, 1, spacingRendered)).version.content, spacingRendered);
  for (const draft of drafts) await assert.rejects(save(db, 2, 2, draft), { code: '22023' });
  await db.exec('reset role');
  await migrate(db, ['20261123000053_carousel_shape_diagrams']);
  await identify(db, alice);
  assert.deepEqual((await save(db, 2, 2, spacing)).version.content, spacing);

  for (const draft of drafts) {
    const { type } = draft.carouselPlan.slides[1].diagram;
    for (const fields of [
      { layout: 'comparison_dual' },
      { layout: 'native_serial' },
      { layout: 'cta_closing' },
      { artSha256: 'a'.repeat(64) },
      { art: 'data:image/png;base64,AA==' },
      { diagram: type },
      { diagram: { type, labels: ['Antes', 'Depois'] } },
      { diagram: { type, sample: 'Oferta' } },
      { diagram: { type, color: null } },
    ]) {
      const invalid = structuredClone(draft);
      Object.assign(invalid.carouselPlan.slides[1], fields);
      await assert.rejects(save(db, 3, 3, renderedContent(invalid)), { code: '22023' }, JSON.stringify(fields));
    }
    const wrongMode = structuredClone(draft);
    wrongMode.carouselPlan.mode = 'native_serial';
    await assert.rejects(save(db, 3, 3, renderedContent(wrongMode)), { code: '22023' }, type);
    const stale = renderedContent(draft);
    stale.carouselPlan.slides[1].diagram = { type: types.find(candidate => candidate !== type) };
    await assert.rejects(save(db, 3, 3, stale), { code: '22023' }, type);
  }

  const expected = [legacy, spacingRendered, spacing];
  for (const draft of drafts) {
    assert.deepEqual((await save(db, expected.length, expected.length, draft)).version.content, draft);
    expected.push(draft);
    for (const layout of ['split_horizontal', 'svg_diagram', 'framed_plate']) {
      const candidate = structuredClone(draft);
      candidate.carouselPlan.slides[1].layout = layout;
      const rendered = renderedContent(candidate);
      assert.deepEqual((await save(db, expected.length, expected.length, rendered)).version.content, rendered);
      expected.push(rendered);
    }
  }
  const history = await db.query('select public.list_project_piece_versions_v3($1) result', [project]);
  assert.deepEqual(history.rows[0].result.map(version => version.content), expected);
});

test('JSONB inválido em composição ou marcador retorna invalid_request sem criar versões', async t => {
  const db = await fixture(t);
  await migrate(db, ['20261122000048_carousel_composition']);
  await identify(db, alice);
  const draft = governedContent();
  const rendered = renderedContent(draft);
  const variants = [
    ['documento nulo', null],
    ['documento escalar', 'x'],
    ['documento em lista', []],
    ['plano nulo', { ...draft, carouselPlan: null }],
    ['plano escalar', { ...draft, carouselPlan: 'x' }],
    ['plano em lista', { ...draft, carouselPlan: [] }],
    ['marcador sem plano', { ...legacy, carouselRender: rendered.carouselRender }],
    ['marcador nulo', { ...draft, carouselRender: null }],
    ['marcador escalar', { ...draft, carouselRender: 'x' }],
  ];
  const mutate = (name, baseline, edit) => {
    const content = structuredClone(baseline);
    edit(content);
    variants.push([name, content]);
  };
  mutate('lâmina nula', draft, value => { value.carouselPlan.slides[1] = null; });
  mutate('lâmina escalar', draft, value => { value.carouselPlan.slides[1] = 'x'; });
  mutate('lista de lâminas escalar', draft, value => { value.carouselPlan.slides = 1; });
  mutate('lâmina duplicada', draft, value => { value.carouselPlan.slides[1].frameId = frameId(1); });
  mutate('frame em lista', draft, value => { value.frames[1] = []; });
  mutate('frame escalar', draft, value => { value.frames[1] = 'x'; });
  mutate('campo dinâmico escalar', draft, value => { value.fields = ['x']; });
  mutate('posição escalar', draft, value => { value.frames[1].position = 'x'; });
  mutate('posição fora do inteiro', draft, value => { value.frames[1].position = 10 ** 18; });
  mutate('ativo sem marcador', draft, value => { value.frames[1].assetId = jpegId(1); });
  mutate('paleta nula', draft, value => { value.carouselPlan.tokens = null; });
  mutate('paleta com tipo inválido', draft, value => { value.carouselPlan.tokens.accent = 7; });
  mutate('alt com controle', draft, value => { value.carouselPlan.slides[1].alt = 'Uma\nquebra'; });
  mutate('kicker com controle', draft, value => { value.carouselPlan.slides[1].kicker = 'Uma\tquebra'; });
  mutate('lista escalar', draft, value => { value.carouselPlan.slides[1].listItems = 'x'; });
  mutate('lista com controle', draft, value => { value.carouselPlan.slides[1].listItems = ['A\tB']; });
  mutate('amostra com controle', draft, value => { value.carouselPlan.slides[1].diagram.sample = 'A\nB'; });
  mutate('rótulo de diagrama com controle', draft, value => { value.carouselPlan.slides[1].diagram.labels[1] = 'A\tB'; });
  mutate('rótulos com tipo inválido', draft, value => { value.carouselPlan.slides[1].diagram.labels = 'x'; });
  mutate('diagrama sem amostra', draft, value => { delete value.carouselPlan.slides[1].diagram.sample; });
  mutate('estatística sem fonte', draft, value => { value.carouselPlan.slides[1].layout = 'stat_monument'; });
  mutate('receita SVG sem diagrama', draft, value => {
    value.carouselPlan.slides[1].layout = 'svg_diagram';
    delete value.carouselPlan.slides[1].diagram;
  });
  mutate('digest desatualizado após mudança de legenda', rendered, value => { value.caption = 'Novo texto. #compor'; });
  mutate('digest desatualizado após mudança de copy', rendered, value => { value.frames[1].headline = 'Outra manchete'; });
  mutate('digest incorreto', rendered, value => { value.carouselRender.planSha256 = 'b'.repeat(64); });
  mutate('painel escalar', rendered, value => { value.carouselRender.frames[1] = 'x'; });
  mutate('painel de outra lâmina', rendered, value => { value.carouselRender.frames[1].frameId = frameId(1); });
  mutate('painel com alt divergente', rendered, value => { value.carouselRender.frames[1].alt = 'Divergente.'; });
  mutate('ativo duplicado', rendered, value => { value.frames[1].assetId = jpegId(1); });

  // Passing the JSON text directly preserves a 64-digit JSON number without JavaScript rounding.
  variants.push(['digest numérico do plano', JSON.stringify(rendered)
    .replace(JSON.stringify(rendered.carouselRender.planSha256), '1'.repeat(64))]);
  variants.push(['digest numérico da lâmina', JSON.stringify(rendered)
    .replace(JSON.stringify(rendered.carouselRender.frames[1].sha256), '1'.repeat(64))]);

  for (const [name, content] of variants) {
    const text = typeof content === 'string' && content.startsWith('{') ? content : JSON.stringify(content);
    await assert.rejects(db.query('select public.save_piece_version_v3($1,$2,0,0,$3::jsonb,null,null)',
      [project, piece, text]), { code: '22023', message: 'invalid_request' }, name);
  }
  assert.deepEqual((await db.query('select version from public.piece_versions')).rows, []);
});
