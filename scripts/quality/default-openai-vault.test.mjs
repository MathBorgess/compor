import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const secret='sk-'+ 'synthetic-vault-default-'.repeat(2);
const foreign='sk-'+ 'synthetic-other-secret-'.repeat(2);

test('only service_role reads the fixed Vault name; preparation works before Vault and no browser role extracts a secret',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    grant usage on schema auth,public to public;grant execute on function auth.role() to public;`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261110000028_default_openai_vault.sql',import.meta.url),'utf8'));
  const lookup=async()=>(await db.query('select public.compor_default_openai_key() as value')).rows[0].value;
  const claims=role=>db.query("select set_config('request.jwt.claim.role',$1,false)",[role]);
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);await claims(role);
    await assert.rejects(lookup,error=>error.code==='42501');
    await db.exec('reset role');
  }
  await db.exec('set role service_role');await claims('service_role');
  assert.equal(await lookup(),null,'migration and lookup tolerate an unprovisioned Vault');
  await db.exec('reset role');
  await db.exec('create schema vault;create table vault.secrets(name text,decrypted_secret text);create view vault.decrypted_secrets as select * from vault.secrets;');
  await db.query('insert into vault.secrets values($1,$2)',['other_secret',foreign]);
  await db.exec('set role service_role');await claims('service_role');
  assert.equal(await lookup(),null,'the RPC cannot select another secret');
  await assert.rejects(()=>db.query('select * from vault.decrypted_secrets'),error=>error.code==='42501','administrative RPC grant does not expose the Vault view');
  await db.exec('reset role');
  await db.query('insert into vault.secrets values($1,$2)',['COMPOR_CIN_OPENAI',secret]);
  await db.exec('set role service_role');await claims('service_role');
  assert.equal(await lookup(),secret);
  await db.exec('reset role');await db.query('update vault.secrets set decrypted_secret=$1 where name=$2',['sk-'+'x'.repeat(300),'COMPOR_CIN_OPENAI']);
  await db.exec('set role service_role');await claims('service_role');assert.equal(await lookup(),'sk-'+'x'.repeat(300),'long valid OpenAI keys are supported by PostgreSQL validation');
  await db.exec('reset role');await db.query('update vault.secrets set decrypted_secret=$1 where name=$2',['sk-'+'x'.repeat(301),'COMPOR_CIN_OPENAI']);
  await db.exec('set role service_role');await claims('service_role');assert.equal(await lookup(),null,'overlong key is unavailable');
  await claims('authenticated');await assert.rejects(lookup,error=>error.code==='42501','role claim is checked inside the security-definer function');
  await db.exec('reset role');
  await db.exec('grant execute on function public.compor_default_openai_key() to authenticated;set role authenticated');await claims('authenticated');
  await assert.rejects(lookup,error=>error.code==='42501','an accidental extra grant still does not permit an authenticated JWT');
  await db.exec('reset role');await db.exec('revoke execute on function public.compor_default_openai_key() from authenticated');
  await db.query('update vault.secrets set decrypted_secret=$1 where name=$2',['invalid','COMPOR_CIN_OPENAI']);
  await db.exec('set role service_role');await claims('service_role');assert.equal(await lookup(),null);
  await db.exec('reset role');await db.query('update vault.secrets set decrypted_secret=$1 where name=$2',[secret,'COMPOR_CIN_OPENAI']);
  await db.query('insert into vault.secrets values($1,$2)',['COMPOR_CIN_OPENAI',secret]);
  await db.exec('set role service_role');await claims('service_role');assert.equal(await lookup(),null,'ambiguous configuration does not choose a secret');
  await db.exec('reset role');await db.exec('drop view vault.decrypted_secrets;create view vault.decrypted_secrets as select name,(1/0)::text as decrypted_secret from vault.secrets');
  await db.exec('set role service_role');await claims('service_role');assert.equal(await lookup(),null,'Vault failure is not serialized as a database error');
});
