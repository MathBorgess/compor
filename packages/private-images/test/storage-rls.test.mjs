import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('políticas amplas anteriores não liberam imagem alheia ou sobrescrita, nem afetam outro bucket', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, storage, public to public;
    grant execute on function auth.uid() to public;
    create table public.projects (id uuid primary key, owner_id uuid not null);
    create table public.piece_versions (project_id uuid not null, piece_id uuid not null, version integer not null);
    grant select on public.projects, public.piece_versions to authenticated;
    alter table public.projects enable row level security;
    alter table public.piece_versions enable row level security;
    create policy project_owner on public.projects for select to authenticated using (owner_id = auth.uid());
    create policy version_owner on public.piece_versions for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text not null, name text not null, primary key(bucket_id, name));
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated, anon;
    create policy prior_broad_policy on storage.objects for all to public using (true) with check (true);
    insert into public.projects values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111'), ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    insert into public.piece_versions values ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',1), ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc',1);
    insert into storage.objects values
      ('compor-project-images','11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/1/44444444-4444-4444-8444-444444444444.png'),
      ('compor-project-images','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/1/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png'),
      ('other-bucket','other.png');
  `);
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261103000003_private_project_images.sql', import.meta.url), 'utf8'));
  await db.exec("set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)");
  const visible = await db.query('select bucket_id, name from storage.objects order by bucket_id, name');
  assert.equal(visible.rows.length, 2, 'outro usuário não pode ler mesmo sob política permissiva');
  assert.ok(visible.rows.some(row => row.bucket_id === 'other-bucket'));
  const updated = await db.query("update storage.objects set name='changed.png' where bucket_id='compor-project-images' returning name");
  assert.equal(updated.rows.length, 0, 'nem o proprietário pode sobrescrever');
  const deleted = await db.query("delete from storage.objects where bucket_id='compor-project-images' returning name");
  assert.equal(deleted.rows.length, 0, 'nem o proprietário pode apagar');
  await assert.rejects(() => db.query("insert into storage.objects values ('compor-project-images','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/1/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png')"));
  await assert.rejects(() => db.query("insert into storage.objects values ('compor-project-images','11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/2/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png')"));
  await assert.rejects(() => db.query("insert into storage.objects values ('compor-project-images','11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/1/../../evil.png')"));
  await db.exec("insert into storage.objects values ('compor-project-images','11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/1/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png')");
  await assert.rejects(() => db.query("update storage.objects set bucket_id='compor-project-images' where bucket_id='other-bucket'"));
  await db.exec("insert into storage.objects values ('other-bucket','extra.png')");
  assert.equal((await db.query("update storage.objects set name='renamed.png' where bucket_id='other-bucket' and name='other.png' returning name")).rows.length, 1);
  assert.equal((await db.query("delete from storage.objects where bucket_id='other-bucket' and name='renamed.png' returning name")).rows.length, 1);
  await db.exec('reset role; set role anon');
  const anonymous = await db.query('select bucket_id, name from storage.objects');
  assert.ok(anonymous.rows.every(row => row.bucket_id === 'other-bucket'), 'anon não lê imagens privadas');
  await assert.rejects(() => db.query("insert into storage.objects values ('compor-project-images','11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/1/ffffffff-ffff-4fff-8fff-ffffffffffff.png')"));
});
