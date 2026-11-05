import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222',project='33333333-3333-4333-8333-333333333333',req='44444444-4444-4444-8444-444444444444',req2='55555555-5555-4555-8555-555555555555';
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to public;grant execute on function auth.uid() to public;`);
 for(const name of ['20261103000000_projects.sql','20261103000002_agent_attempts.sql','20261103000008_agent_attempt_state.sql','20261105000013_studio_turn_metadata.sql'])await db.exec(await readFile(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.query('insert into auth.users(id)values($1),($2)',[alice,bob]);await db.query('insert into public.projects(id,owner_id,title)values($1,$2,$3)',[project,alice,'Projeto sintético']);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${alice}',false)`);return db;
}
test('metadados serializam por projeto, deduplicam request e não expõem tabela',async t=>{
 const db=await fixture(t),reserve='select public.reserve_studio_turn($1,$2,$3) as r',hash='a'.repeat(64);
 const first=(await db.query(reserve,[project,req,hash])).rows[0].r;assert.equal(first.status,'reserved');assert.ok(first.turn.attempt_id);
 assert.equal((await db.query(reserve,[project,req,hash])).rows[0].r.status,'existing');
 assert.equal((await db.query(reserve,[project,req,'b'.repeat(64)])).rows[0].r.status,'conflict');
 assert.equal((await db.query(reserve,[project,req2,hash])).rows[0].r.status,'busy');
 await assert.rejects(()=>db.query('select * from public.studio_turns'));await assert.rejects(()=>db.query('select * from public.studio_action_submissions'));
 const bind='select public.bind_studio_session($1,$2,$3,now()+interval \'4 minutes\',null,0,0) as r';
 assert.equal((await db.query(bind,[project,req,'v4.abc.def'])).rows[0].r,true);
 await db.query("select public.set_studio_turn_state($1,$2,'completed','turn_one')",[project,req]);
 assert.equal((await db.query(reserve,[project,req2,hash])).rows[0].r.status,'reserved');
 assert.equal((await db.query("select public.set_studio_turn_state($1,$2,'running','turn_one') as r",[project,req])).rows[0].r,false,'terminal não reabre');
});
test('RPCs só operam com dono do projeto e chamadas têm recibos não repetíveis',async t=>{
 const db=await fixture(t),hash='a'.repeat(64);
 await db.query('select public.reserve_studio_turn($1,$2,$3)',[project,req,hash]);
 await db.query("select public.bind_studio_session($1,$2,'v4.abc.def',now()+interval '4 minutes',null,0,0)",[project,req]);
 await db.query("select public.set_studio_turn_state($1,$2,'action_required','turn_one')",[project,req]);
 const claim='select public.claim_studio_action($1,$2,$3,$4,$5,$6) as r',args=[project,req,'turn_one','call_one',hash,'b'.repeat(64)];
 const first=(await db.query(claim,args)).rows[0].r;assert.equal(first.status,'claimed');assert.equal((await db.query(claim,args)).rows[0].r.status,'existing');
 assert.equal((await db.query(claim,[...args.slice(0,5),'c'.repeat(64)])).rows[0].r.status,'conflict');
 await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false)`);
 assert.equal((await db.query('select public.get_studio_turn($1,$2) as r',[project,req])).rows[0].r,null);
 assert.equal((await db.query('select public.reserve_studio_turn($1,$2,$3) as r',[project,req2,hash])).rows[0].r.status,'not_found');
 assert.equal((await db.query("select public.finish_studio_action($1,$2,$3,'accepted') as r",[project,req,first.id])).rows[0].r,false);
 assert.equal((await db.query("select public.set_studio_turn_state($1,$2,'completed','turn_one') as r",[project,req])).rows[0].r,false);
});
