import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {POST} from '../app/api/mcp/route.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),project=id(2),requestId=id(3),key=`sk-${'x'.repeat(30)}`;
test('MCP usa o mesmo serviço autenticado, bloqueia projeto alheio e não regenera id concluído',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};let generations=0,record=null;
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:'http://localhost:3000',COMPOR_PRIVATE_IMAGES_ENABLED:'true'});
 const png=Buffer.from('89504e470d0a1a0a01020304','hex');
 globalThis.fetch=async(target,options={})=>{
  const url=new URL(target),path=url.pathname;
  if(path==='/auth/v1/user')return Response.json({id:actor});
  if(path==='/rest/v1/projects')return Response.json(url.searchParams.get('id')===`eq.${project}`?[{id:project,owner_id:actor}]:[]);
  if(path.endsWith('/reserve_exploration_image')){const body=JSON.parse(options.body);if(record)return Response.json([{state:record,is_new:false}]);assert.equal(body.p_id,requestId);record='running';return Response.json([{state:'running',is_new:true}]);}
  if(path.endsWith('/finish_exploration_image')){record=JSON.parse(options.body).p_state;return Response.json(true);}
  if(path==='/v1/images/generations'){generations++;assert.equal(options.headers.Authorization,`Bearer ${key}`);return Response.json({data:[{b64_json:png.toString('base64')}]});}
  if(path.includes('/storage/v1/object/'))return options.method==='POST'?Response.json({}):new Response(png,{headers:{'content-type':'image/png'}});
  throw Error(`unexpected ${path}`);
 };
 const client=new Client({name:'test',version:'1'}),transport=new StreamableHTTPClientTransport(new URL('http://localhost:3000/api/mcp'),{requestInit:{headers:{authorization:'Bearer user-token','x-compor-openai-key':key}},fetch:(input,init)=>POST(new Request(input,init))});
 try {
  await client.connect(transport);
  const args={projectId:project,requestId,prompt:'Referência visual para cerâmica'};
  const first=await client.callTool({name:'generate_exploration_image',arguments:args});assert.deepEqual(first.structuredContent,{status:'completed',requestId,imageId:requestId});
  const again=await client.callTool({name:'generate_exploration_image',arguments:args});assert.deepEqual(again.structuredContent,first.structuredContent);assert.equal(generations,1);
  const image=await client.callTool({name:'get_exploration_image',arguments:{projectId:project,imageId:requestId}});assert.deepEqual(image.content,[{type:'image',mimeType:'image/png',data:png.toString('base64')}]);
  const forbidden=await client.callTool({name:'generate_exploration_image',arguments:{...args,projectId:id(99),requestId:id(4)}});assert.equal(forbidden.structuredContent.status,'unknown');assert.equal(generations,1);
  assert.doesNotMatch(JSON.stringify([first,again,forbidden]),/sk-xxx|user-token/);
 } finally {await client.close();globalThis.fetch=oldFetch;process.env=oldEnv;}
});
