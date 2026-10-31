import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { LocalCreativeStore } from '../dist/creative/local_creative.js';
import { ProfileLedger } from '../dist/phoenix_engine/services/profile_ledger.js';
import { registerProfileTools } from '../dist/phoenix_engine/mcp/profile_tools.js';
import { createComporServer } from '../dist/server.js';

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const layers=[{id:'title',text:'Olá',x:0,y:0,font_size_px:12,color_hex:'#123456',font_family:'serif'}];
const base={kind:'reaction',scope:{type:'campaign',id:'campaign'},source:'conversation',person_statement:'Prefiro assim.'};
async function connect(root,actor,verifier,ledger) {
  const server=new McpServer({name:'local-binding-test',version:'1'});
  registerProfileTools(server,actor,{ledger,directory:Promise.resolve(root),persistenceDirectory:root},undefined,verifier);
  const client=new Client({name:'local-binding-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();
  await server.connect(st);await client.connect(ct);
  return {client,close:async()=>{await client.close();await server.close();}};
}

test('local piece signals require consent and verify the exact owner, piece and version before persisting', async () => {
  const root=await mkdtemp(join(tmpdir(),'compor-profile-binding-'));
  try {
    const aliceStore=new LocalCreativeStore(root,'alice'),bobStore=new LocalCreativeStore(root,'bob');
    const a=await aliceStore.create('alice',{base_png_base64:png,layers});
    const other=await aliceStore.create('alice',{base_png_base64:png,layers});
    const ledger=await ProfileLedger.restoreLocal('alice',root);
    let calls=0;
    const verify=async(actor,piece,version)=>{calls++;return aliceStore.read(actor,piece,version);};
    const alice=await connect(root,'alice',verify,ledger);
    const noVerifier=await connect(root,'alice',undefined,ledger);
    const bobLedger=await ProfileLedger.restoreLocal('bob',root);
    const bob=await connect(root,'bob',(actor,piece,version)=>bobStore.read(actor,piece,version),bobLedger);
    const call=(c,name,args)=>c.client.callTool({name,arguments:args});
    const bound={...base,id:'bound',piece_id:a.snapshot.piece_id,version_id:a.snapshot.version_id};
    try {
      assert.equal((await call(alice,'phoenix_profile_signal',bound)).isError,true);
      assert.equal(calls,0,'without consent the host must not read a piece');
      assert.notEqual((await call(alice,'phoenix_profile_consent',{purpose:'personalization',granted:true})).isError,true);
      assert.equal((await call(noVerifier,'phoenix_profile_signal',bound)).isError,true,'absence of host verifier must fail closed');
      assert.equal((await call(alice,'phoenix_profile_signal',{...bound,id:'alias',version_id:'v1'})).isError,true);
      assert.equal((await call(alice,'phoenix_profile_signal',{...bound,id:'wrong',version_id:other.snapshot.version_id})).isError,true,'a version belonging to another piece must fail');
      assert.equal((await call(alice,'phoenix_profile_signal',{...bound,id:'missing',version_id:'v_'+ '0'.repeat(32)})).isError,true);
      assert.notEqual((await call(bob,'phoenix_profile_consent',{purpose:'personalization',granted:true})).isError,true);
      assert.equal((await call(bob,'phoenix_profile_signal',{...bound,id:'cross'})).isError,true,'another owner cannot bind this piece');
      const external=await call(alice,'phoenix_profile_signal',{...base,id:'external',version_id:'remote-revision-1'});
      assert.notEqual(external.isError,true,'external pieces remain possible without local binding');
      assert.equal(external.structuredContent.local_binding,null);
      const result=await call(alice,'phoenix_profile_signal',bound);
      assert.notEqual(result.isError,true,JSON.stringify(result));
      assert.equal(result.structuredContent.event.piece_id,a.snapshot.piece_id);
      assert.equal(result.structuredContent.event.version_id,a.snapshot.version_id);
      assert.equal(result.structuredContent.local_binding.status,'verified_at_registration');
      assert.equal(result.structuredContent.local_binding.history_complete,true);
      const duplicate=await call(alice,'phoenix_profile_signal',bound);
      assert.equal(duplicate.structuredContent.duplicate,true);
      assert.equal((await call(alice,'phoenix_profile_signal',{...bound,person_statement:'Diferente'})).isError,true);
      const read=await call(alice,'phoenix_profile_read',{});
      assert.equal(read.structuredContent.profile.events.length,2,'blocked attempts create no event');
      const md=await readFile(read.structuredContent.markdown_path,'utf8');
      assert.match(md,new RegExp(a.snapshot.piece_id));
      assert.match(md,new RegExp(a.snapshot.version_id));
      await call(alice,'phoenix_profile_consent',{purpose:'personalization',granted:false});
      const before=calls;
      assert.equal((await call(alice,'phoenix_profile_signal',{...bound,id:'revoked'})).isError,true);
      assert.equal(calls,before,'revocation must prevent the local read');
      const restored=await ProfileLedger.restoreLocal('alice',root);
      assert.equal(restored.read('alice').events.find(e=>e.id==='bound').piece_id,a.snapshot.piece_id);
      assert.equal(restored.read('alice').events.find(e=>e.id==='external').piece_id,undefined);
    } finally {await alice.close();await noVerifier.close();await bob.close();}
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('revocation during asynchronous host verification cannot commit an event', async () => {
  const root=await mkdtemp(join(tmpdir(),'compor-profile-binding-race-'));
  try {
    const store=new LocalCreativeStore(root,'owner');
    const piece=await store.create('owner',{base_png_base64:png,layers});
    const ledger=await ProfileLedger.restoreLocal('owner',root);
    ledger.setConsent('owner','personalization',true);
    let resume, started;
    const start=new Promise(r=>{started=r;}), gate=new Promise(r=>{resume=r;});
    const conn=await connect(root,'owner',async(actor,id,version)=>{started();await gate;return store.read(actor,id,version);},ledger);
    try {
      const pending=conn.client.callTool({name:'phoenix_profile_signal',arguments:{...base,id:'race',piece_id:piece.snapshot.piece_id,version_id:piece.snapshot.version_id}});
      await start;
      ledger.setConsent('owner','personalization',false);
      resume();
      assert.equal((await pending).isError,true);
      assert.equal(ledger.read('owner').events.length,0);
    } finally {await conn.close();}
  } finally {await rm(root,{recursive:true,force:true});}
});

test('integrated Compor server binds an actual creative version and refuses a false local version', async () => {
  const root=await mkdtemp(join(tmpdir(),'compor-profile-binding-server-'));
  try {
    const actor='local-owner', store=new LocalCreativeStore(root,actor), ledger=await ProfileLedger.restoreLocal(actor,root);
    const server=createComporServer({phoenixActorId:actor,creativeStore:store,phoenixProfileSession:{ledger,directory:Promise.resolve(root),persistenceDirectory:root}});
    const client=new Client({name:'local-binding-integration',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
    try {
      const consent=await client.callTool({name:'phoenix_profile_consent',arguments:{purpose:'personalization',granted:true}});
      assert.notEqual(consent.isError,true);
      const created=await client.callTool({name:'creative_local_create',arguments:{base_png_base64:png,layers}});
      assert.notEqual(created.isError,true);
      const snap=created.structuredContent.snapshot;
      const signal={...base,id:'from-client',piece_id:snap.piece_id,version_id:snap.version_id};
      const good=await client.callTool({name:'phoenix_profile_signal',arguments:signal});
      assert.notEqual(good.isError,true,JSON.stringify(good));
      assert.equal(good.structuredContent.event.piece_id,snap.piece_id);
      assert.equal(good.structuredContent.local_binding.status,'verified_at_registration');
      const bad=await client.callTool({name:'phoenix_profile_signal',arguments:{...signal,id:'bad',version_id:'v_'+ '0'.repeat(32)}});
      assert.equal(bad.isError,true);
      assert.deepEqual(ledger.read(actor).events.map(e=>e.id),['from-client']);
    } finally {await client.close();await server.close();}
  } finally {await rm(root,{recursive:true,force:true});}
});
