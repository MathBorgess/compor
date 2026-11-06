import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRemoteMcpHandler } from '../src/index.js';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const key=`sk-${'x'.repeat(30)}`;
const args={projectId:id(1),requestId:id(2),prompt:'Referência para oficina de cerâmica'};
async function connect(handle,headers) {
 const client=new Client({name:'test',version:'1'});
 const transport=new StreamableHTTPClientTransport(new URL('https://compor.test/mcp'),{requestInit:{headers:{Authorization:'Bearer session-token',...headers}},fetch:(input,init)=>handle(new Request(input,init))});
 await client.connect(transport);return client;
}
test('MCP encaminha chave pelo cabeçalho e usa conta autenticada sem expor segredo à ferramenta ou resposta',async()=>{
 const calls=[];
 const handle=createRemoteMcpHandler({authenticate:async token=>token==='session-token'?{userId:id(3)}:null,exploration:async(...values)=>{calls.push(values);return{status:'completed',requestId:args.requestId,imageId:args.requestId};}});
 const client=await connect(handle,{'x-compor-openai-key':key});
 try {
  const tool=(await client.listTools()).tools.find(item=>item.name==='generate_exploration_image');
  assert.ok(tool);assert.doesNotMatch(JSON.stringify(tool),/api.?key|sk-xxx/i);
  const result=await client.callTool({name:tool.name,arguments:args});
  assert.deepEqual(result.structuredContent,{status:'completed',requestId:args.requestId,imageId:args.requestId});
  assert.deepEqual(calls[0],[{actor:{userId:id(3)},token:'session-token'},args,key]);
  assert.doesNotMatch(JSON.stringify(result),/sk-xxx|session-token/);
 } finally {await client.close();}
});
test('sem chave no transporte ou com segredo em prompt não executa e não vaza',async()=>{
 let calls=0;
 const handle=createRemoteMcpHandler({authenticate:async()=>({userId:id(3)}),exploration:async()=>{calls++;throw Error(key);}});
 const missing=await connect(handle,{}),provided=await connect(handle,{'x-compor-openai-key':key});
 try {
  for(const [client,input] of [[missing,args],[provided,{...args,prompt:`Instrução ${key}`} ]]) {
   const result=await client.callTool({name:'generate_exploration_image',arguments:input});assert.equal(result.isError,true);assert.doesNotMatch(JSON.stringify(result),/sk-xxx/);
  }
  assert.equal(calls,0);
 } finally {await missing.close();await provided.close();}
});
test('resultado incerto é devolvido sem repetição automática',async()=>{
 let calls=0;
 const handle=createRemoteMcpHandler({authenticate:async()=>({userId:id(3)}),exploration:async()=>{calls++;return{status:'unknown',requestId:args.requestId,retryAutomatically:false};}});
 const client=await connect(handle,{'x-compor-openai-key':key});
 try {const result=await client.callTool({name:'generate_exploration_image',arguments:args});assert.deepEqual(result.structuredContent,{status:'unknown',requestId:args.requestId,retryAutomatically:false});assert.equal(calls,1);}finally{await client.close();}
});
test('recusa confirmada é comunicada sem repetir nem expor a chave',async()=>{
 let calls=0;
 const handle=createRemoteMcpHandler({authenticate:async()=>({userId:id(3)}),exploration:async()=>{calls++;return{status:'rejected',requestId:args.requestId,retryAutomatically:false};}});
 const client=await connect(handle,{'x-compor-openai-key':key});
 try {
  const result=await client.callTool({name:'generate_exploration_image',arguments:args});
  assert.deepEqual(result.structuredContent,{status:'rejected',requestId:args.requestId,retryAutomatically:false});
  assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(result),/sk-xxx|session-token/);
 } finally {await client.close();}
});
test('MCP respeita a pausa compartilhada e retoma somente pela ferramenta explícita',async()=>{
 let resumed=0;
 const handle=createRemoteMcpHandler({authenticate:async()=>({userId:id(3)}),exploration:async()=>({status:'awaiting_feedback',requestId:args.requestId,retryAutomatically:false}),explorationResume:async(context,input)=>{assert.equal(context.actor.userId,id(3));assert.equal(input.projectId,args.projectId);resumed++;return 'resumed';}});
 const client=await connect(handle,{'x-compor-openai-key':key});
 try {
  assert.deepEqual((await client.callTool({name:'generate_exploration_image',arguments:args})).structuredContent,{status:'awaiting_feedback',requestId:args.requestId,retryAutomatically:false});
  assert.equal(resumed,0);
  assert.deepEqual((await client.callTool({name:'resume_exploration',arguments:{projectId:args.projectId}})).structuredContent,{status:'resumed'});assert.equal(resumed,1);
 } finally {await client.close();}
});
test('falha de serviço não revela credenciais nem transmite mensagens de erro internas',async()=>{
 const handle=createRemoteMcpHandler({authenticate:async()=>({userId:id(3)}),exploration:async()=>{throw Error(key+' session-token');}});
 const client=await connect(handle,{'x-compor-openai-key':key});
 try {const result=await client.callTool({name:'generate_exploration_image',arguments:args});assert.deepEqual(result.structuredContent,{status:'unknown',requestId:args.requestId,retryAutomatically:false});assert.doesNotMatch(JSON.stringify(result),/sk-xxx|session-token/);}finally{await client.close();}
});
test('imagem privada pode ser lida pelo MCP sem pedir chave OpenAI',async()=>{
 const png=Buffer.from('89504e470d0a1a0a01020304','hex'),calls=[];
 const handle=createRemoteMcpHandler({authenticate:async()=>({userId:id(3)}),explorationRead:async(...values)=>{calls.push(values);return png;}});
 const client=await connect(handle,{});
 try {
  const result=await client.callTool({name:'get_exploration_image',arguments:{projectId:id(1),imageId:id(2)}});
  assert.deepEqual(result.content,[{type:'image',mimeType:'image/png',data:png.toString('base64')}]);
  assert.deepEqual(calls,[[{actor:{userId:id(3)},token:'session-token'},{projectId:id(1),imageId:id(2)}]]);
 } finally {await client.close();}
});
