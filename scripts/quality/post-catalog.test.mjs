import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('post catalog rollback proof enforces ownership, idempotency and no resurrection',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to public;grant execute on function auth.uid() to public;`);
  for(const name of ['20261103000000_projects.sql','20261103000001_piece_versions.sql','20261105000014_version_metadata.sql','20261115000030_project_deletion.sql','20261115000031_project_posts.sql'])await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
  await db.exec("set compor.post_catalog_proof='allow-empty-isolated'");
  const proof=await readFile(new URL('../../supabase/tests/post_catalog_rollback.sql',import.meta.url),'utf8');
  await db.exec(proof.replace(/^\\set[^\n]*\n/m,''));
  assert.equal((await db.query('select count(*)::int as count from public.project_posts')).rows[0].count,0,'proof rolls back all fixture rows');
});
