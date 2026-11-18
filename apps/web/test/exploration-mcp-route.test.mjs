import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {POST} from '../handlers/api/mcp/route.ts';

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
  if(path.endsWith('/reserve_exploration_image_proven')){const body=JSON.parse(options.body);if(record)return Response.json([{state:record,is_new:false}]);assert.equal(body.p_id,requestId);record='running';return Response.json([{state:'running',is_new:true}]);}
  if(path.endsWith('/complete_exploration_image_proven')){record='completed';return Response.json(true);}
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
  const forbidden=await client.callTool({name:'generate_exploration_image',arguments:{...args,projectId:id(99),requestId:id(4)}});assert.deepEqual(forbidden.structuredContent,{status:'not_started',requestId:id(4),retryAutomatically:false});assert.equal(generations,1);
  assert.doesNotMatch(JSON.stringify([first,again,forbidden]),/sk-xxx|user-token/);
 } finally {await client.close();globalThis.fetch=oldFetch;process.env=oldEnv;}
});

test('MCP informa recusa do provedor confirmada e não repete a mesma tentativa',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};let generations=0,record=null,rejectionDigest;
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:'http://localhost:3000',COMPOR_PRIVATE_IMAGES_ENABLED:'true'});
 globalThis.fetch=async(target,options={})=>{
  const url=new URL(target),path=url.pathname;
  if(path==='/auth/v1/user')return Response.json({id:actor});
  if(path==='/rest/v1/projects')return Response.json([{id:project,owner_id:actor}]);
  if(path.endsWith('/reserve_exploration_image_proven')){const body=JSON.parse(options.body);if(record)return Response.json([{state:record,is_new:false}]);rejectionDigest=body.p_rejection_digest;record='running';return Response.json([{state:'running',is_new:true}]);}
  if(path.endsWith('/reject_exploration_image')){const body=JSON.parse(options.body);const {createHash}=await import('node:crypto');assert.equal(createHash('sha256').update(Buffer.from(body.p_rejection_secret,'hex')).digest('hex'),rejectionDigest);record='rejected';return Response.json(true);}
  if(path==='/v1/images/generations'){generations++;return Response.json({error:{message:'invalid key'}},{status:401});}
  throw Error(`unexpected ${path}`);
 };
 const client=new Client({name:'test',version:'1'}),transport=new StreamableHTTPClientTransport(new URL('http://localhost:3000/api/mcp'),{requestInit:{headers:{authorization:'Bearer user-token','x-compor-openai-key':key}},fetch:(input,init)=>POST(new Request(input,init))});
 try {
  await client.connect(transport);const args={projectId:project,requestId,prompt:'Referência visual para cerâmica'};
  const first=await client.callTool({name:'generate_exploration_image',arguments:args}),again=await client.callTool({name:'generate_exploration_image',arguments:args});
  assert.deepEqual(first.structuredContent,{status:'rejected',requestId,retryAutomatically:false});assert.deepEqual(again.structuredContent,first.structuredContent);
  assert.equal(generations,1);assert.doesNotMatch(JSON.stringify([first,again]),/sk-xxx|user-token|rejection_secret|rejection_digest/);
 } finally {await client.close();globalThis.fetch=oldFetch;process.env=oldEnv;}
});

test('MCP mantém resultado desconhecido após falha ao reservar e não chama o provedor',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};let reserves=0,generations=0;
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:'http://localhost:3000',COMPOR_PRIVATE_IMAGES_ENABLED:'true'});
 globalThis.fetch=async(target)=>{
  const path=new URL(target).pathname;
  if(path==='/auth/v1/user')return Response.json({id:actor});
  if(path==='/rest/v1/projects')return Response.json([{id:project,owner_id:actor}]);
  if(path.endsWith('/reserve_exploration_image_proven')){reserves++;throw Error('connection dropped');}
  if(path==='/v1/images/generations')generations++;
  throw Error('unexpected request');
 };
 const client=new Client({name:'test',version:'1'}),transport=new StreamableHTTPClientTransport(new URL('http://localhost:3000/api/mcp'),{requestInit:{headers:{authorization:'Bearer user-token','x-compor-openai-key':key}},fetch:(input,init)=>POST(new Request(input,init))});
 try {
  await client.connect(transport);const args={projectId:project,requestId,prompt:'Referência visual para cerâmica'};
  const result=await client.callTool({name:'generate_exploration_image',arguments:args});
  assert.deepEqual(result.structuredContent,{status:'unknown',requestId,retryAutomatically:false});assert.equal(reserves,1);assert.equal(generations,0);
 } finally {await client.close();globalThis.fetch=oldFetch;process.env=oldEnv;}
});
