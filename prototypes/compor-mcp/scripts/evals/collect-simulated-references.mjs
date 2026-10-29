/** Collect real curated-source previews for the simulated persona. No model, staging or HTML. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createComporServer } from '../../dist/server.js';
const target=await mkdtemp(join(tmpdir(),'compor-e2e-previews-'));
await mkdir(target,{recursive:true,mode:0o700});
const server=createComporServer();const client=new Client({name:'phoenix-e2e-references',version:'1'});const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
try {
 const started=performance.now(); const result=await client.callTool({name:'search_curated_references',arguments:{briefing_summary:'Peça para Instagram de curso fictício de finanças para pessoas autônomas: separar dinheiro pessoal e do trabalho, com segurança e acolhimento, sem estética bancária, porquinho, cifrões ou gráficos de bolsa.',target_format:'single_feed',aspect_focus:['composition','typography','color'],source_ids:['pinterest_curated_design'],consent_external_search:true}});
 if(result.isError) throw new Error(JSON.stringify(result.structuredContent ?? {error:'search_error'}));
 const {candidates,...rest}=result.structuredContent; const byId=new Map(candidates.map(c=>[c.ref_id,c]));let id;
 for(const item of result.content){if(item.type==='text'){const m=item.text.match(/^Prévia da referência (\S+) /);id=m?.[1];}else if(item.type==='image'&&id&&byId.has(id)){const ext={'image/webp':'webp','image/png':'png','image/jpeg':'jpg'}[item.mimeType];if(!ext)continue;const path=join(target,`${id}.${ext}`);await writeFile(path,Buffer.from(item.data,'base64'),{mode:0o600});byId.get(id).local_preview_path=path;id=undefined;}}
 const output={created_at:new Date().toISOString(),stage:'real_search_before_decision_ranker',elapsed_ms:Math.round(performance.now()-started),...rest,candidates};await writeFile(join(target,'search.json'),JSON.stringify(output,null,2),{mode:0o600});console.log(JSON.stringify({directory:target,count:candidates.length,with_previews:candidates.filter(c=>c.local_preview_path).length,elapsed_ms:output.elapsed_ms,search_file:join(target,'search.json')}));
} finally {await client.close();await server.close();}
