import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfiguredAgentMcpScope } from '../lib/agent-mcp-scope.mjs';

test('MCP delegado exige flag e chave canônica própria antes de aceitar requisições', () => {
 const config={service:'https://project.supabase.co',app:'https://compor.vercel.app',key:'sb_publishable_test'};
 const key=Buffer.alloc(32,3).toString('base64url');
 assert.equal(createConfiguredAgentMcpScope(config,{}),null);
 assert.equal(createConfiguredAgentMcpScope(config,{COMPOR_AGENT_MCP_ENABLED:'true'}),null);
 assert.equal(createConfiguredAgentMcpScope(config,{COMPOR_AGENT_MCP_ENABLED:'true',COMPOR_AGENT_MCP_KEY:key,COMPOR_AGENT_HMAC_SECRET:key}),null);
 assert.ok(createConfiguredAgentMcpScope(config,{COMPOR_AGENT_MCP_ENABLED:'true',COMPOR_AGENT_MCP_KEY:key}));
});

test('emissor revalida titularidade e handler limita chamada a projeto autenticado', async () => {
 const user='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',piece='44444444-4444-4444-8444-444444444444';
 const token='mock-user-token';let reads=0;
 const fetch=async(url,init)=>{
  assert.equal(init.headers.authorization,`Bearer ${token}`);
  if(url.pathname==='/auth/v1/user')return Response.json({id:user});
  if(url.pathname==='/rest/v1/projects')return Response.json([{id:project,owner_id:user}]);
  if(url.pathname==='/rest/v1/piece_versions'){reads++;return Response.json([]);}
  throw Error('unexpected');
 };
 const scope=createConfiguredAgentMcpScope({service:'https://project.supabase.co',app:'https://compor.vercel.app',key:'sb_publishable_test'},{COMPOR_AGENT_MCP_ENABLED:'true',COMPOR_AGENT_MCP_KEY:Buffer.alloc(32,5).toString('base64url')},fetch);
 assert.equal(await scope.issue({token,projectId:other}),null);
 const grant=await scope.issue({token,projectId:project});assert.ok(grant);assert.ok(!grant.includes(token));
 const call=async projectId=>{
  const request=new Request('https://compor.vercel.app/api/agent-mcp',{method:'POST',headers:{authorization:`Bearer ${grant}`,'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_piece_versions',arguments:{projectId,pieceId:piece}}})});
  const response=await scope.handle(request);return response.json();
 };
 assert.equal((await call(other)).result.isError,true);assert.equal(reads,0);
 assert.deepEqual((await call(project)).result.structuredContent,{versions:[]});assert.equal(reads,1);
});
