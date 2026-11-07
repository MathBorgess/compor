import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const alice='11111111-1111-4111-8111-111111111111', bob='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project='22222222-2222-4222-8222-222222222222', piece='33333333-3333-4333-8333-333333333333';
const content={headline:'Oficina',price:'',date:'',caption:'',captionOrigin:'user'};
const field={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',label:'Inscrições',value:'Abertas',origin:'agent'};

test('campos dinâmicos preservam versões legadas e isolamento com validação estrita',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to public;grant execute on function auth.uid() to public;`);
  for(const name of ['20261103000000_projects.sql','20261103000001_piece_versions.sql','20261105000014_version_metadata.sql'])
    await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[alice,bob]);
  await db.query("insert into public.projects(id,owner_id,title) values($1,$2,'Alice')",[project,alice]);
  const user=async id=>db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);
  const save=async(expected,base,value)=>(await db.query('select public.save_piece_version_v2($1,$2,$3,$4,$5) as result',[project,piece,expected,base,value])).rows[0].result;
  await user(alice);assert.equal((await save(0,0,content)).status,'saved');
  await db.exec('reset role');await db.exec(await readFile(new URL('../../supabase/migrations/20261106000021_piece_dynamic_fields.sql',import.meta.url),'utf8'));
  await user(alice);
  const updated={...content,fields:[field]};const saved=await save(1,1,updated);
  assert.equal(saved.status,'saved');assert.deepEqual(saved.version.content,updated);
  const versions=(await db.query('select public.list_project_piece_versions_v2($1) as result',[project])).rows[0].result;
  assert.deepEqual(versions.map(v=>v.content),[content,updated]);
  assert.deepEqual(await save(1,1,updated),{status:'conflict',currentVersion:2});
  for(const fields of [
    [{...field,id:'not-a-uuid'}], [{...field,label:'   '}], [{...field,extra:'x'}],
    [{...field,origin:'third-party'}], [{...field,value:'secret sk-abc'}], [{...field,value:'line\nline'}],
    [{...field},{...field,id:field.id.toUpperCase()}], Array.from({length:21},()=>field), null,
  ]) await assert.rejects(()=>save(2,2,{...content,fields}));
  await assert.rejects(()=>db.query("update public.piece_versions set content='{}'"));
  const legacy=(await db.query('select public.save_piece_version($1,$2,$3,$4) as result',[project,piece,2,content])).rows[0].result;
  assert.equal(legacy.status,'saved');assert.equal(legacy.version.version,3);assert.equal(Object.hasOwn(legacy.version,'metadata'),false);
  await user(bob);assert.deepEqual(await save(2,2,updated),{status:'not_found'});
  assert.equal((await db.query('select * from public.piece_versions')).rows.length,0);
  await db.exec('set role anon');await assert.rejects(()=>save(3,3,updated));
});
