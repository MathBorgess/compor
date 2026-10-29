/** Synthetic persona: derive a new local piece linked to an explicit earlier version. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createComporServer } from '../../dist/server.js';
import { LocalCreativeStore } from '../../dist/creative/local_creative.js';
const [input, firstFile, dest] = process.argv.slice(2,5).map(value=>resolve(value));
const suffix = process.argv[5] ?? 'segunda-peca';
if (!/^[a-z0-9-]+$/.test(suffix)) throw new Error('Invalid output suffix');
if(!input||!firstFile||!dest)throw new Error('Usage: node compose-fotografia-revisao.mjs base.png first-evidence.json output-dir');
const first=JSON.parse(await readFile(firstFile,'utf8'));
const actor='synthetic_photo_persona', store=new LocalCreativeStore(first.profile,actor,{allowedImageRoots:[dirname(input)]});
const server=createComporServer({phoenixActorId:actor,creativeStore:store}),client=new Client({name:'foto-e2e-revision',version:'1'});
const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
try {
 const make=(id,text,y,size,weight='normal')=>({id,text,x:.085,y,font_size_px:size,color_hex:'#fff8eb',font_family:'serif',font_weight:weight});
 const layers=[make('title_1','Seu produto,',.05,90,'bold'),make('title_2','outra luz',.12,90,'bold'),make('support_1','Estou imaginando um curso',.20,43),make('support_2','de fotografia de produtos',.233,43),make('support_3','para pequenos negócios.',.266,43)];
 const r=await client.callTool({name:'creative_local_create_from_file',arguments:{local_png_path:input,confirm_local_image_use:true,layers,derived_from:{piece_id:first.piece_id,version_id:first.version_id},caption:{origin:'agent_proposal',text:first.caption.text}}});
 if(r.isError)throw new Error(JSON.stringify(r));const d=r.structuredContent;
 const svg=await readFile(d.svg_path), sharp=createRequire(import.meta.url)('sharp');
 const preview=join(dest,`fotografia-${suffix}.png`),small=join(dest,`fotografia-${suffix}-360.png`);
 await writeFile(preview,await sharp(svg).png().toBuffer(),{flag:'wx',mode:0o600});
 await writeFile(small,await sharp(svg).resize({width:360}).png().toBuffer(),{flag:'wx',mode:0o600});
 const evidence={kind:'synthetic_local_preview',profile:first.profile,source:'image generation; not a photo of the person\'s work',piece_id:d.snapshot.piece_id,version_id:d.snapshot.version_id,derived_from:d.snapshot.derived_from,base_sha256:d.snapshot.base_sha256,svg_path:d.svg_path,preview,preview_360:small,caption:d.snapshot.caption,layers:d.snapshot.layers};
 const file=resolve(dest,`../fotografia-creative-${suffix}-evidence.json`);await writeFile(file,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({preview,small,svg_path:d.svg_path,piece_id:d.snapshot.piece_id,version_id:d.snapshot.version_id,evidence:file}));
} finally {await client.close();await server.close();}
