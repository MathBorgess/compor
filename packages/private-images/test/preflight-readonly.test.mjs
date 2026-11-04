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
  const sql=(await readFile(new URL('../../../supabase/tests/preflight_readonly.sql',import.meta.url),'utf8'))
    .replace(/^\\set .*$/m,'')
    .replace(/select exists \([\s\S]*?\) as migration_history_safe_to_read \\gset[\s\S]*?\\endif/, '');
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
  const storage=rows.find(row=>row.storage_relation==='objects');
  assert.ok(storage);assert.equal(storage.member_of_owner,true);assert.equal(storage.inherits_owner_privileges,true);
});

test('preflight somente consulta histórico quando a tabela atende às condições', async t => {
 const db=new PGlite();t.after(()=>db.close());
 const sql=await readFile(new URL('../../../supabase/tests/preflight_readonly.sql',import.meta.url),'utf8');
 const guard=sql.match(/select exists \([\s\S]*?\) as migration_history_safe_to_read \\gset/)[0].replace('\\gset',';');
 assert.equal((await db.query(guard)).rows[0].migration_history_safe_to_read,false);
 await db.exec(`create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text); insert into supabase_migrations.schema_migrations values ('20261103000000'),('não registrar');`);
 assert.equal((await db.query(guard)).rows[0].migration_history_safe_to_read,true);
 const rows=await db.query(`select version from supabase_migrations.schema_migrations where version ~ '^[0-9]{14}$' order by version`);
 assert.deepEqual(rows.rows,[{version:'20261103000000'}]);
 await db.exec('alter table supabase_migrations.schema_migrations enable row level security');
 assert.equal((await db.query(guard)).rows[0].migration_history_safe_to_read,false);
 await db.exec('alter table supabase_migrations.schema_migrations disable row level security; create rule history_rule as on update to supabase_migrations.schema_migrations do instead nothing');
 assert.equal((await db.query(guard)).rows[0].migration_history_safe_to_read,false);
});

test('indicadores distinguem membro do proprietário de papel sem vínculo', async t => {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role storage_owner;create role viewer;create role stranger;
 grant storage_owner to viewer;create schema storage authorization storage_owner;
 set role storage_owner;create table storage.objects(id integer);reset role;`);
 const sql=await readFile(new URL('../../../supabase/tests/preflight_readonly.sql',import.meta.url),'utf8');
 const query=sql.match(/select c\.relname as storage_relation[\s\S]*?order by 1;/)[0];
 await db.exec('set role viewer');let result=(await db.query(query)).rows[0];
 assert.equal(result.member_of_owner,true);assert.equal(result.inherits_owner_privileges,true);
 await db.exec('reset role;set role stranger');result=(await db.query(query)).rows[0];
 assert.equal(result.member_of_owner,false);assert.equal(result.inherits_owner_privileges,false);
});
