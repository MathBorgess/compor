import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EphemeralReferenceStore } from '../dist/staging/ephemeral_store.js';
import { PhoenixMemoryStore } from '../dist/phoenix_engine/services/memory_store.js';
import { createPhoenixHyperparams } from '../dist/phoenix_engine/config/hyperparams.js';

const p='https://www.pinterest.com/pin/123456/';
const alias='https://br.pinterest.com/pin/123456/?utm_source=test';
const q='https://www.pinterest.com/pin/987654/';
const caption={title:'fiction',caption:'fiction',alt_text:'',aspect_rationale:{},envelope:{isolation_tag:'external',context_role:'reference_only',is_instruction:false}};
const item=(origin)=>({preferred_ref_id:'same',source_id:'pinterest_curated_design',origin_url:origin,preview_url:'https://i.pinimg.com/236x/test.jpg',media_url:'https://i.pinimg.com/736x/test.jpg',aspect_rationale:{},untrusted_external_caption:caption,thumbnail_base64:null});

test('memory contexts isolate feedback, vectors and persisted blocks by actor and campaign', async () => {
  const memory=new PhoenixMemoryStore({hp:createPhoenixHyperparams()});
  const one=memory.setReferenceContext('alice','c1',[alias]);
  assert.ok(one.rejected_origins.has(p));
  memory.registerDiscoveredCandidates('alice',[{candidate_id:'ref1',board:'board',metadata_sid:['format','grid'],visual_description:'fiction',origin_url:q,embedding_text:'fiction',vec:[1,0],space:'local_deterministic_sha256'}]);
  await memory.recordFeedback({user_id:'alice',event_id:'e1',candidate_id:'ref1',board:'board',metadata_sid:['format','grid'],action:'discard_generic',dwell_time_ms:0,candidate_vec:[1,0]});
  assert.ok(one.rejected_origins.has(q));assert.equal(one.neg_session_vecs.length,1);
  const two=memory.setReferenceContext('alice','c2',[]);
  assert.notEqual(two.session_token,one.session_token);
  assert.equal(two.neg_session_vecs.length,0);assert.equal(two.rejected_origins.size,0);assert.equal(two.discovered_candidates.size,0);
  assert.equal(memory.setReferenceContext('bob','c1',[]).rejected_origins.size,0);
  memory.setReferenceContext('alice','c1',[]); // revocation removes profile blocks but not an explicit session rejection
  assert.equal(one.rejected_origins.has(p),false);assert.ok(one.rejected_origins.has(q));
  memory.reconsiderReference('alice',q);
  assert.equal(one.rejected_origins.has(q),false);assert.equal(one.neg_session_vecs.length,1,'history is not deleted');
  assert.equal(memory.setReferenceContext('alice','c2').session_token,two.session_token);
});

test('reference aliases and staged records are isolated, consent revocation and explicit reconsideration affect only their context', async () => {
  const dir=await mkdtemp(join(tmpdir(),'phoenix-context-'));
  try {
    const store=new EphemeralReferenceStore({stagingRoot:dir});
    store.setReferenceContext('alice/c1',[]);
    store.registerSearchCandidates('sid-c1',[item(p)]);
    const first=store.getCandidate('ref_01');assert.equal(first.origin_url,p);
    const evidence=join(dir,'preserved-evidence.txt');await writeFile(evidence,'keep');
    store.recordStagedReference({ref_id:first.ref_id,origin_url:p,local_path:evidence},first.aliases);
    store.rejectOrigin(alias);
    assert.equal(store.getCandidate('ref_01'),undefined);assert.equal(store.getStagedReference('ref_01'),undefined);
    assert.equal(await readFile(evidence,'utf8'),'keep');
    store.setReferenceContext('alice/c2',[p]);
    assert.equal(store.getCandidate('ref_01'),undefined,'aliases from another campaign must not resolve');
    assert.throws(()=>store.getActiveSessionId('sid-c1'),/another reference context/);
    store.registerSearchCandidates('sid-c2',[item(q)]);
    assert.equal(store.getCandidate('ref_01').origin_url,q);
    assert.equal(store.getStagedReference('ref_01'),undefined,'staged aliases are not shared');
    store.setReferenceContext('alice/c1',[]);
    assert.equal(store.getCandidate('ref_01'),undefined,'session rejection remains after profile revocation');
    store.reconsiderOrigin(p);
    assert.equal(store.getCandidate('ref_01').origin_url,p);
    assert.equal(store.getStagedReference('ref_01').origin_url,p);
    assert.equal(await readFile(evidence,'utf8'),'keep');
    store.setReferenceContext('alice/c2',[p]);
    assert.deepEqual(store.registerSearchCandidates('sid-c2',[item(p)]),[]);
    assert.equal(store.getCandidate('ref_01').origin_url,q,'a rejected result does not overwrite an unrelated alias');
    store.setReferenceContext('alice/c2',[]); // revoke profile-sourced block; no local reject exists in c2
    store.registerSearchCandidates('sid-c2',[item(p)]);
    assert.equal(store.getCandidate('ref_01').origin_url,p);
    store.setReferenceContext('alice/c1',[]);
    assert.equal(store.getCandidate('ref_01').origin_url,p);
  } finally {await rm(dir,{recursive:true,force:true});}
});
