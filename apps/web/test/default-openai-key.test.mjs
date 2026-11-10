import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultOpenAiConfigured,resolveDefaultOpenAiKey} from '../lib/default-openai-key.ts';

const config={service:'https://example.supabase.co'};
const defaultKey='sk-'+ 'synthetic-default-only-'.repeat(2);
const serverKey='sb_secret_'+ 'synthetic_server_'.repeat(2);
const env={COMPOR_DEFAULT_OPENAI_ENABLED:'true',SUPABASE_SERVER_KEY:serverKey};
const response=value=>Response.json(value);
const jwt=role=>['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({role})).toString('base64url'),'c3ludGhldGljX3NpZ25hdHVyZQ'].join('.');

test('default lookup is opt-in and rejects public credentials or invalid service origins without a request',async()=>{
  let calls=0;const fetch=async()=>{calls++;return response(defaultKey);};
  for(const value of [{},{...env,COMPOR_DEFAULT_OPENAI_ENABLED:'false'},{...env,SUPABASE_SERVER_KEY:'sb_publishable_public'},{...env,SUPABASE_SERVER_KEY:jwt('anon')},{...env,SUPABASE_SERVER_KEY:jwt('authenticated')},{...env,SUPABASE_SERVER_KEY:'not-a-key'}]){
    assert.equal(defaultOpenAiConfigured(config,value),false);
    assert.equal(await resolveDefaultOpenAiKey(config,value,fetch),null);
  }
  for(const service of ['http://example.supabase.co','https://user:password@example.supabase.co','https://example.supabase.co/path','https://example.supabase.co/?secret=bad','invalid']){
    assert.equal(defaultOpenAiConfigured({service},env),false);
    assert.equal(await resolveDefaultOpenAiKey({service},env,fetch),null);
  }
  assert.equal(calls,0);
});

test('server credential is confined to one non-cached bounded RPC and the lookup does not cache plaintext',async()=>{
  let calls=0;
  const fetch=async(url,options)=>{
    calls++;assert.equal(String(url),'https://example.supabase.co/rest/v1/rpc/compor_default_openai_key');
    assert.equal(options.method,'POST');assert.equal(options.body,'{}');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    assert.equal(options.headers.apikey,serverKey);assert.equal(options.headers.authorization,undefined,'opaque server keys must not be sent as Bearer JWTs');
    assert.ok(options.signal instanceof AbortSignal);
    return response(calls===1?defaultKey:null);
  };
  assert.equal(defaultOpenAiConfigured(config,env),true);
  assert.equal(await resolveDefaultOpenAiKey(config,env,fetch),defaultKey);
  assert.equal(await resolveDefaultOpenAiKey(config,env,fetch),null,'revocation or missing secret is observed on the next lookup');
  assert.equal(calls,2);
  const legacy=jwt('service_role');
  assert.equal(await resolveDefaultOpenAiKey(config,{...env,SUPABASE_SERVER_KEY:legacy},async(_url,options)=>{
    assert.equal(options.headers.apikey,legacy);assert.equal(options.headers.authorization,`Bearer ${legacy}`);
    return response(defaultKey);
  }),defaultKey);
});

test('malformed, oversized, missing and failed Vault responses remain unavailable without exposing diagnostics',async()=>{
  const replies=[
    ()=>response(null),()=>response({key:defaultKey}),()=>response('not-a-provider-key'),()=>response(defaultKey+'\n'),
    ()=>response('sk-'+ 'x'.repeat(301)),()=>response(' '.repeat(1025)+JSON.stringify(defaultKey)),
    ()=>new Response(JSON.stringify(defaultKey),{headers:{'content-type':'text/plain'}}),
    ()=>new Response('not-json',{headers:{'content-type':'application/json'}}),
    ()=>new Response(JSON.stringify({error:defaultKey,credential:serverKey}),{status:500,headers:{'content-type':'application/json'}}),
  ];
  for(const reply of replies)assert.equal(await resolveDefaultOpenAiKey(config,env,async()=>reply()),null);
  assert.equal(await resolveDefaultOpenAiKey(config,env,async()=>{throw Error(defaultKey+' '+serverKey);}),null);
  assert.equal(await resolveDefaultOpenAiKey(config,env,async()=>{throw new DOMException('request timed out','TimeoutError');}),null);
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1025));},cancel(){cancelled=true;}});
  assert.equal(await resolveDefaultOpenAiKey(config,env,async()=>new Response(stream,{headers:{'content-type':'application/json'}})),null);
  assert.equal(cancelled,true,'stop reading once the response exceeds the secret-sized bound');
});
