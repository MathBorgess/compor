import test from 'node:test';
import assert from 'node:assert/strict';
import { accountIdentity } from '../lib/account-identity.ts';
import { parseSessionState } from '../lib/session-state.ts';
import { createSignOutRoute } from '../lib/sign-out-route.ts';

test('conta usa nome verificado, depois e-mail, e distingue sessão local anônima',()=>{
  assert.deepEqual(accountIdentity({id:'alice',email:'alice@example.com',user_metadata:{full_name:'  Alice\nSilva ',avatar_url:'https://example.com/a'}},false),{userId:'alice',account:{label:'Alice Silva',local:false}});
  assert.deepEqual(accountIdentity({id:'bob',email:'bob@example.com',user_metadata:{}},false),{userId:'bob',account:{label:'bob@example.com',local:false}});
  assert.deepEqual(accountIdentity({id:'test',is_anonymous:true,email:'ignored@example.com'},true),{userId:'test',account:{label:'Conta local',local:true}});
  assert.deepEqual(accountIdentity({id:'anonymous',is_anonymous:true},false),{userId:'anonymous',account:{label:'Conta anônima',local:false}});
  assert.deepEqual(accountIdentity({id:'unknown'},false),{userId:'unknown',account:{label:'Conta conectada',local:false}});
  assert.throws(()=>accountIdentity({id:''},false));
});
test('sessão devolve apenas identidade de exibição validada',()=>{
  assert.deepEqual(parseSessionState({state:'connected',userId:'alice',account:{label:'Alice',local:false,token:'secret'},token:'secret'}),{state:'connected',userId:'alice',account:{label:'Alice',local:false}});
  for(const account of [null,{}, {label:'',local:false}, {label:'Alice',local:'true'}, {label:'bad\nname',local:false}])assert.throws(()=>parseSessionState({state:'connected',userId:'alice',account}));
});
test('saída exige origem do app e não expõe falhas do provedor',async()=>{
  let calls=0;
  const route=createSignOutRoute({appOrigin:'http://localhost:3000',signOut:async()=>{calls++;}});
  const request=origin=>new Request('http://localhost:3000/auth/sign-out',{method:'POST',headers:{origin}});
  assert.equal((await route(request('http://other.test'))).status,403);assert.equal(calls,0);
  const success=await route(request('http://localhost:3000'));
  assert.deepEqual(await success.json(),{state:'signed-out'});assert.equal(calls,1);assert.equal(success.headers.get('cache-control'),'no-store');
  const failure=createSignOutRoute({appOrigin:'http://localhost:3000',signOut:async()=>{throw Error('private provider detail');}});
  const unavailable=await failure(request('http://localhost:3000'));assert.equal(unavailable.status,503);assert.deepEqual(await unavailable.json(),{error:'unavailable'});
});
