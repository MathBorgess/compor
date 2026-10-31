/** Synthetic persona: create a local versioned SVG through the MCP, then render a PNG preview. */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createComporServer } from '../../dist/server.js';
import { LocalCreativeStore } from '../../dist/creative/local_creative.js';
const [base, dest] = process.argv.slice(2).map(value => resolve(value));
if(!base||!dest)throw new Error('Usage: node compose-fotografia-e2e.mjs base.png output-directory');
const profile=await mkdtemp(join(dest,'fotografia-profile-'));
const actor='synthetic_photo_persona',store=new LocalCreativeStore(profile,actor,{allowedImageRoots:[dirname(base)]});
const server=createComporServer({phoenixActorId:actor,creativeStore:store}),client=new Client({name:'foto-e2e',version:'1'});
const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
try {
 const make=(id,text,y,size,weight='normal')=>({id,text,x:.085,y,font_size_px:size,color_hex:'#213f3a',font_family:'serif',font_weight:weight});
 const layers=[make('title_1','Outro olhar para',.07,79,'bold'),make('title_2','o seu produto',.135,79,'bold'),make('support_1','Estou imaginando um curso de',.23,40),make('support_2','fotografia de produtos para',.265,40),make('support_3','pequenos negócios.',.30,40)];
 const result=await client.callTool({name:'creative_local_create_from_file',arguments:{local_png_path:base,confirm_local_image_use:true,layers,caption:{origin:'agent_proposal',text:'Estou imaginando um curso de fotografia de produtos para pequenos negócios. Como você costuma mostrar o que faz?'}}});
 if(result.isError)throw new Error(JSON.stringify(result));
 const d=result.structuredContent,sharp=createRequire(import.meta.url)('sharp');
 const svg=await readFile(d.svg_path), png=await sharp(svg).png().toBuffer();
 const preview=join(dest,'fotografia-primeira-peca.png');await writeFile(preview,png,{flag:'wx',mode:0o600});
 const small=join(dest,'fotografia-primeira-peca-360.png');await writeFile(small,await sharp(svg).resize({width:360}).png().toBuffer(),{flag:'wx',mode:0o600});
 const evidence={kind:'synthetic_local_preview',profile,source:'image generation; not a photo of the person\'s work',piece_id:d.snapshot.piece_id,version_id:d.snapshot.version_id,base_sha256:d.snapshot.base_sha256,svg_path:d.svg_path,preview,preview_360:small,caption:d.snapshot.caption,layers:d.snapshot.layers};
 const path=resolve(dest,'../fotografia-creative-evidence.json');await writeFile(path,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({preview,small,svg_path:d.svg_path,piece_id:d.snapshot.piece_id,version_id:d.snapshot.version_id,evidence:path}));
} finally {await client.close();await server.close();}
