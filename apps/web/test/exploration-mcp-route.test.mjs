import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {POST} from '../handlers/api/mcp/route.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),project=id(2),requestId=id(3),key=`sk-${'x'.repeat(30)}`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
test('MCP usa o mesmo serviço autenticado, bloqueia projeto alheio e não regenera id concluído',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};let generations=0,record=null;
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:'http://localhost:3000',COMPOR_PRIVATE_IMAGES_ENABLED:'true'});
 globalThis.fetch=async(target,options={})=>{
  const url=new URL(target),path=url.pathname;
  if(path==='/auth/v1/user')return Response.json({id:actor});
  if(path==='/rest/v1/projects')return Response.json(url.searchParams.get('id')===`eq.${project}`?[{id:project,owner_id:actor}]:[]);
  if(path.endsWith('/reserve_exploration_image_proven')){const body=JSON.parse(options.body);if(record)return Response.json([{state:record,is_new:false}]);assert.equal(body.p_id,requestId);record='running';return Response.json([{state:'running',is_new:true}]);}
  if(path.endsWith('/complete_exploration_image_proven')){record='completed';return Response.json(true);}
  if(path.endsWith('/mark_exploration_image_unknown_proven')){record='unknown';return Response.json(true);}
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

test('MCP com revisão obrigatória usa a segunda credencial e retém antes do Storage', async () => {
 const oldFetch=globalThis.fetch,oldEnv={...process.env};
 const reviewKey=`sk-${'r'.repeat(30)}`,prompt='Cartaz de uma oficina de cerâmica em 14 de agosto';
 const calls=[];
 const requestOptions={requestInit:{headers:{authorization:'Bearer user-token','x-compor-openai-key':key}},fetch:(input,init)=>POST(new Request(input,init))};
 const client=new Client({name:'test',version:'1'});
 const transport=new StreamableHTTPClientTransport(new URL('http://localhost:3000/api/mcp'),requestOptions);
 let digest,held=false;
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:'http://localhost:3000',COMPOR_PRIVATE_IMAGES_ENABLED:'true',COMPOR_IMAGE_QUALITY_REVIEW:'required',COMPOR_IMAGE_REVIEW_OPENAI_API_KEY:reviewKey});
 globalThis.fetch=async (target,options={})=>{
  const url=new URL(target),path=url.pathname;
  if(path==='/auth/v1/user')return Response.json({id:actor});
  if(path==='/rest/v1/projects'){calls.push('ownership');return Response.json([{id:project,owner_id:actor}]);}
  if(path.endsWith('/reserve_exploration_image_proven')){
   calls.push('reserve');
   if(held)return Response.json([{state:'quality_held',is_new:false}]);
   digest=JSON.parse(options.body).p_rejection_digest;
   return Response.json([{state:'running',is_new:true}]);
  }
  if(path==='/v1/images/generations'){
   calls.push('generate');
   assert.equal(new Headers(options.headers).get('authorization'),`Bearer ${key}`);
   return Response.json({data:[{b64_json:png.toString('base64')}]});
  }
  if(path==='/v1/responses'){
   calls.push('review');
   assert.equal(new Headers(options.headers).get('authorization'),`Bearer ${reviewKey}`);
   const payload=JSON.parse(options.body);
   assert.deepEqual(payload.input[0].content,[
    {type:'input_text',text:JSON.stringify({pedido:prompt})},
    {type:'input_image',detail:'high',image_url:`data:image/png;base64,${png.toString('base64')}`},
   ]);
   const verdict={
    decision:'reject',
    checks:{visual_integrity:'pass',required_text:'fail',factual_fidelity:'pass',generic_direction:'pass'},
    findings:[{code:'required_text',region:'peça inteira',evidence:'A data da oficina está ausente.'}],
   };
   return Response.json({status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(verdict)}]}]});
  }
  if(path.endsWith('/hold_exploration_image_quality')){
   calls.push('hold');
   const proof=JSON.parse(options.body);
   assert.equal(proof.p_project_id,project);
   assert.equal(proof.p_id,requestId);
   assert.equal(proof.p_quality_reason,'image_quality_rejected');
   assert.equal(createHash('sha256').update(Buffer.from(proof.p_rejection_secret,'hex')).digest('hex'),digest);
   held=true;
   return Response.json(true);
  }
  calls.push(path);
  throw Error('unexpected upstream');
 };
 try {
  await client.connect(transport);
  const args={projectId:project,requestId,prompt};
  const first=await client.callTool({name:'generate_exploration_image',arguments:args});
  assert.deepEqual(first.structuredContent,{status:'quality_held',requestId,qualityReason:'image_quality_rejected',retryAutomatically:false});
  assert.deepEqual(calls,['ownership','reserve','generate','ownership','review','hold']);
  const repeated=await client.callTool({name:'generate_exploration_image',arguments:args});
  assert.equal(repeated.structuredContent.status,'quality_held');
  assert.deepEqual(calls.slice(6),['ownership','reserve']);
 } finally {await client.close();globalThis.fetch=oldFetch;process.env=oldEnv;}
});
