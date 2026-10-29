/** Interactive synthetic-persona harness: JSON lines in, compact observations out. */
import { createInterface } from 'node:readline';
import { readFileSync, closeSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createComporServer } from '../../dist/server.js';
import { ProfileLedger } from '../../dist/phoenix_engine/services/profile_ledger.js';
import { EphemeralReferenceStore } from '../../dist/staging/ephemeral_store.js';
import { PhoenixDecisionApiService } from '../../dist/phoenix_engine/services/decision_api.js';
import { createPhoenixHyperparams } from '../../dist/phoenix_engine/config/hyperparams.js';
import OpenAI from 'openai';
const credentialFd = process.env.COMPOR_API_KEY_FD ? Number(process.env.COMPOR_API_KEY_FD) : null;
let apiKey;
if (credentialFd !== null) {
 if (!Number.isInteger(credentialFd) || credentialFd < 3) throw new Error('Invalid credential pipe');
 apiKey = readFileSync(credentialFd, 'utf8').trim(); closeSync(credentialFd);
} else apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('Authorized API credential required');
const profileDir=process.argv[2];if(!profileDir)throw new Error('Need isolated simulated profile directory');
const actor='simulation_e2e_20261029', ledger=await ProfileLedger.restoreLocal(actor,profileDir);
const out=await mkdtemp(join(tmpdir(),'compor-decision-mcp-'));const store=new EphemeralReferenceStore({stagingRoot:join(out,'staging')});
const api=new OpenAI({apiKey,maxRetries:0,timeout:45000}), apiMetrics=[];
for(const [kind,resource] of [['router_responses',api.responses],['embeddings',api.embeddings],['decision',api.decisions]]){
 const original=resource.create.bind(resource);resource.create=async(...args)=>{const start=performance.now();try{const response=await original(...args);apiMetrics.push({kind,model:response.model??args[0]?.model??null,latency_ms:Math.round(performance.now()-start),status:'ok',usage:response.usage??null});return response;}catch(error){apiMetrics.push({kind,latency_ms:Math.round(performance.now()-start),status:'error',http_status:error.status??null});throw error;}};
}
const hp=createPhoenixHyperparams(), service=new PhoenixDecisionApiService({hp,openaiClient:api});
const server=createComporServer({phoenixActorId:actor,phoenixProfileSession:{ledger,persistenceDirectory:profileDir,directory:Promise.resolve(profileDir)},referenceStore:store,phoenixDecisionService:service});
const client=new Client({name:'decision-e2e-simulated',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
console.log(JSON.stringify({ready:true,directory:out}));let seq=0;
try {for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  if(!line.trim())continue;
  try{const cmd=JSON.parse(line);if(cmd.tool==='quit')break;const offset=apiMetrics.length,started=performance.now(),r=await client.callTool({name:cmd.tool,arguments:cmd.args??{}});seq++;const data=r.structuredContent??{};const compact={seq,tool:cmd.tool,elapsed_ms:Math.round(performance.now()-started),isError:r.isError??false,api_metrics:apiMetrics.slice(offset),data};
  if(cmd.tool==='discover_visual_references'&&!r.isError){const previews=[];for(const c of store.listCandidates(data.session_token)){let path=null;if(c.thumbnail_base64&&c.thumbnail_mime_type){const ext={'image/webp':'webp','image/png':'png','image/jpeg':'jpg'}[c.thumbnail_mime_type];if(ext){path=join(out,`${c.ref_id}.${ext}`);await writeFile(path,Buffer.from(c.thumbnail_base64,'base64'),{mode:0o600});}}previews.push({id:c.ref_id,source:c.source_id,origin_url:c.origin_url,preview:path,caption:c.untrusted_external_caption.title});}for(const c of data.candidates??[])delete c.thumbnail_base64;compact.previews=previews;}
  await writeFile(join(out,`event-${String(seq).padStart(2,'0')}.json`),JSON.stringify(compact,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(compact));
  }catch(e){console.log(JSON.stringify({error:'harness_failure',message:String(e.message??'').slice(0,500)}));}
}} finally{await client.close();await server.close();}
