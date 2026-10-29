import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ProfileLedger,canonicalReferenceOrigin } from '../dist/phoenix_engine/services/profile_ledger.js';
import { createComporServer } from '../dist/server.js';

const origin='https://www.pinterest.com/pin/123456/';
const reject={id:'r1',version_id:'v1',campaign_id:'c1',origin_url:'https://br.pinterest.com/pin/123456/?utm_source=example#fragment',action:'reject',person_statement:'Não quero essa imagem.'};

test('reference origins reject aliases and unsafe URLs and normalize only safe resource identity', () => {
  assert.equal(canonicalReferenceOrigin(reject.origin_url),origin);
  assert.throws(()=>canonicalReferenceOrigin('ref_01'),/origin/i);
  assert.throws(()=>canonicalReferenceOrigin('http://www.pinterest.com/pin/123456/'),/origin/i);
  assert.throws(()=>canonicalReferenceOrigin('https://user:password@pinterest.com/pin/123456/'),/origin/i);
  assert.notEqual(canonicalReferenceOrigin('https://pinterest.com.evil.example/pin/123456/'),origin);
  assert.notEqual(canonicalReferenceOrigin('https://www.pinterest.com:8443/pin/123456/'),origin);
  assert.notEqual(canonicalReferenceOrigin('https://example.org/image?id=one'),canonicalReferenceOrigin('https://example.org/image?id=two'));
  assert.equal(canonicalReferenceOrigin('https://example.org/image?id=one&utm_source=x#fragment'),'https://example.org/image?id=one');
});

test('campaign decisions require consent, isolate campaigns, deduplicate and require explicit reconsideration', () => {
  const ledger=new ProfileLedger('alice',()=> '2026-10-29T00:00:00Z');
  assert.throws(()=>ledger.recordReferenceDecision('alice',reject),/consent/i);
  ledger.setConsent('alice','personalization',true);
  assert.throws(()=>ledger.recordReferenceDecision('bob',reject),/denied/i);
  const first=ledger.recordReferenceDecision('alice',reject);
  assert.equal(first.event.origin_url,origin); assert.equal(first.event.source_id,null); assert.equal(first.previous,null);
  assert.equal(ledger.recordReferenceDecision('alice',{...reject,origin_url:origin}).duplicate,true);
  assert.throws(()=>ledger.recordReferenceDecision('alice',{...reject,action:'reconsider'}),/duplicate/i);
  assert.equal(ledger.activeReferenceDecisions('alice','c1')[0].action,'reject');
  assert.deepEqual(ledger.activeReferenceDecisions('alice','c2'),[]);
  assert.throws(()=>ledger.recordReferenceDecision('alice',{...reject,id:'s1',action:'select',selected_attributes:['composition']}),/reconsideration/i);
  assert.equal(ledger.recordReferenceDecision('alice',{...reject,id:'reconsider1',action:'reconsider'}).previous.action,'reject');
  assert.equal(ledger.activeReferenceDecisions('alice','c1')[0].action,'reconsider');
  const selection=ledger.recordReferenceDecision('alice',{...reject,id:'s1',action:'select',source_id:'pinterest_curated_design',selected_attributes:['typography','composition']});
  assert.deepEqual(selection.event.selected_attributes,['composition','typography']);
  assert.equal(selection.event.source_id,'pinterest_curated_design');
  assert.equal(selection.previous.action,'reconsider');
  assert.throws(()=>ledger.recordReferenceDecision('alice',{...reject,id:'bad',action:'reject',selected_attributes:['color']}),/attributes/i);
  assert.throws(()=>ledger.recordReferenceDecision('alice',{...reject,id:'alias',origin_url:'ref_01'}),/origin/i);
  ledger.recordReferenceDecision('alice',{...reject,id:'other-campaign',campaign_id:'c2'});
  assert.equal(ledger.activeReferenceDecisions('alice','c2')[0].action,'reject');
  ledger.setConsent('alice','personalization',false);
  assert.deepEqual(ledger.activeReferenceDecisions('alice','c1'),[]);
  assert.throws(()=>ledger.recordReferenceDecision('alice',{...reject,id:'r2'}),/consent/i);
  assert.equal(ledger.read('alice').reference_decisions.length,4);
  assert.throws(()=>ledger.activeReferenceDecisions('bob','c1'),/denied/i);
});

test('local restore preserves decisions, consent and corrections, and older snapshots remain readable', async () => {
  const dir=await mkdtemp(join(tmpdir(),'phoenix-reference-persist-'));
  try {
    const original=await ProfileLedger.restoreLocal('alice',dir);original.setConsent('alice','personalization',true);
    original.recordReferenceDecision('alice',reject); const path=await original.saveLocal('alice',dir);
    const restored=await ProfileLedger.restoreLocal('alice',dir);
    assert.equal(restored.activeReferenceDecisions('alice','c1')[0].origin_url,origin);
    assert.equal(restored.recordReferenceDecision('alice',{...reject,origin_url:origin}).duplicate,true);
    restored.recordReferenceDecision('alice',{...reject,id:'undo',action:'reconsider'});
    await restored.saveLocal('alice',dir);
    assert.equal((await ProfileLedger.restoreLocal('alice',dir)).activeReferenceDecisions('alice','c1')[0].action,'reconsider');
    const old=JSON.parse(await readFile(path,'utf8'));delete old.reference_decisions;
    await writeFile(path,JSON.stringify(old),{mode:0o600});
    assert.deepEqual((await ProfileLedger.restoreLocal('alice',dir)).activeReferenceDecisions('alice','c1'),[]);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('MCP reference decisions bind actor to host, persist and refuse access after consent revocation', async () => {
  const dir=await mkdtemp(join(tmpdir(),'phoenix-reference-mcp-'));
  const ledger=await ProfileLedger.restoreLocal('alice',dir);
  const session={ledger,persistenceDirectory:dir,directory:Promise.resolve(dir)};
  async function connect(actor){const server=createComporServer({phoenixActorId:actor,phoenixProfileSession:session});const client=new Client({name:'profile-reference',version:'1'});const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);return {server,client};}
  const alice=await connect('alice'),bob=await connect('bob');
  const call=(c,name,args)=>c.client.callTool({name,arguments:args});
  try {
    assert.equal((await call(alice,'phoenix_profile_reference_decision',reject)).isError,true);
    await call(alice,'phoenix_profile_consent',{purpose:'personalization',granted:true});
    assert.equal((await call(bob,'phoenix_profile_reference_decision',{...reject,user_id:'alice'})).isError,true);
    const result=await call(alice,'phoenix_profile_reference_decision',reject);
    assert.notEqual(result.isError,true,JSON.stringify(result));
    assert.match(result.content[0].text,/rejeição/);
    assert.equal(result.structuredContent.event.origin_url,origin);
    assert.equal(result.structuredContent.event.source_id,null);
    assert.equal((await call(alice,'phoenix_profile_reference_decision',{...reject,id:'bad-source',source_id:'invalid_source'})).isError,true);
    assert.equal((await call(alice,'phoenix_profile_reference_decision',{...reject,id:'wrong-domain',source_id:'meta_ad_library'})).isError,true);
    assert.equal((await ProfileLedger.restoreLocal('alice',dir)).activeReferenceDecisions('alice','c1')[0].action,'reject');
    assert.match(await readFile(result.structuredContent.markdown_path,'utf8'),/123456/);
    await call(alice,'phoenix_profile_consent',{purpose:'personalization',granted:false});
    assert.equal((await call(alice,'phoenix_profile_reference_decision',{...reject,id:'later'})).isError,true);
    assert.deepEqual((await ProfileLedger.restoreLocal('alice',dir)).activeReferenceDecisions('alice','c1'),[]);
  } finally {await alice.client.close();await alice.server.close();await bob.client.close();await bob.server.close();await rm(dir,{recursive:true,force:true});}
});
