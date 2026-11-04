import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('preflight local identifica metadados das medições em transação somente leitura', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role authenticated; create role anon; create schema auth; create table auth.users(id uuid primary key);
    create schema storage; create table storage.objects(bucket_id text,name text); create table storage.buckets(id text);
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    grant usage on schema auth,public to public; grant execute on function auth.uid() to public`);
  for (const f of ['00000_projects','00001_piece_versions','00002_agent_attempts','00004_image_tool_reservations','00005_image_consent_declarations','00006_image_tool_execution_claim','00007_image_tool_result_submission','00008_agent_attempt_state','00009_usage_measurements','00010_list_piece_image_assets']) {
    await db.exec(await readFile(new URL(`../../../supabase/migrations/202611030${f}.sql`, import.meta.url),'utf8'));
  }
  await db.exec(`create schema hostile;create function hostile.current_database() returns text language sql as $$select 'falso'::text$$;set search_path=hostile,pg_catalog,public`);
  const sql=(await readFile(new URL('../../../supabase/tests/preflight_readonly.sql',import.meta.url),'utf8')).replace(/^\\set .*$/m,'');
  const rows=(await db.exec(sql)).flatMap(result=>result.rows??[]);
  assert.ok(rows.some(row=>row.read_only==='on'));
  assert.ok(rows.some(row=>row.database_name && row.database_name!=='falso'));
  assert.ok(rows.some(row=>row.relation_name==='usage_measurements' && row.rls_enabled===true));
  for(const name of ['finish_agent_attempt','start_usage_measurement','finish_usage_measurement']) {
    const row=rows.find(item=>item.function_name===name);
    assert.ok(row, name); assert.equal(row.security_definer,true);assert.equal(row.sets_search_path,true);
    assert.equal(row.authenticated_can_execute,true);assert.equal(row.anon_can_execute,false);
  }
  const listing=rows.find(row=>row.function_name==='list_piece_image_assets');
  assert.ok(listing);assert.equal(listing.security_definer,false);assert.equal(listing.authenticated_can_execute,true);assert.equal(listing.anon_can_execute,false);
});
