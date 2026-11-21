import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const alice='11111111-1111-4111-8111-111111111111';
const bob='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project='22222222-2222-4222-8222-222222222222';
const piece='33333333-3333-4333-8333-333333333333';
const asset='44444444-4444-4444-8444-444444444444';
const other='55555555-5555-4555-8555-555555555555';
const content={headline:'Oficina',price:'',date:'',caption:'',captionOrigin:'user'};

test('vínculo da versão é único, idempotente e isolado entre contas',async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to public;grant execute on function auth.uid() to public;
    create schema storage;create table storage.objects(id uuid primary key,bucket_id text not null,name text not null);`);
  for(const name of ['20261103000000_projects.sql','20261103000001_piece_versions.sql','20261119000046_piece_version_image.sql'])
    await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`,import.meta.url),'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[alice,bob]);
  await db.query("insert into public.projects(id,owner_id,title) values($1,$2,'Alice')",[project,alice]);
  const asUser=async id=>db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);
  const bind=id=>db.query('select public.bind_piece_version_image($1,$2,$3,$4) as result',[project,piece,1,id]);
  await asUser(alice);
  assert.equal((await db.query('select public.save_piece_version($1,$2,0,$3) as result',[project,piece,content])).rows[0].result.status,'saved');
  assert.equal((await bind(asset)).rows[0].result.status,'not_found');
  await db.exec('reset role');
  const path=`${alice}/${project}/${piece}/1/${asset}.png`;
  const otherPath=`${alice}/${project}/${piece}/1/${other}.png`;
  await db.query("insert into storage.objects(id,bucket_id,name) values($1,'compor-project-images',$2),($3,'compor-project-images',$4)",['66666666-6666-4666-8666-666666666666',path,'77777777-7777-4777-8777-777777777777',otherPath]);
  await asUser(alice);
  assert.deepEqual((await bind(asset)).rows[0].result,{status:'bound',assetId:asset});
  assert.deepEqual((await bind(asset)).rows[0].result,{status:'bound',assetId:asset});
  assert.equal(Number((await db.query('select count(*)::int as count from public.piece_version_images')).rows[0].count),1);
  assert.deepEqual((await bind(other)).rows[0].result,{status:'conflict',assetId:asset});
  assert.equal((await db.query('select asset_id from public.piece_version_images')).rows[0].asset_id,asset);
  await assert.rejects(()=>db.query('insert into public.piece_version_images(project_id,piece_id,version,asset_id) values($1,$2,1,$3)',[project,piece,other]),error=>error.code==='42501');
  await assert.rejects(()=>db.query('update public.piece_version_images set asset_id=$1',[other]),error=>error.code==='42501');
  await asUser(bob);
  assert.equal((await bind(asset)).rows[0].result.status,'not_found');
  assert.equal(Number((await db.query('select count(*)::int as count from public.piece_version_images')).rows[0].count),0);
  await db.exec('set role anon');
  await assert.rejects(()=>bind(asset),error=>error.code==='42501');
});
