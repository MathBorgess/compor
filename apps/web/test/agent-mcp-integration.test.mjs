import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectAgentHandler } from '@compor/agents-api/project-route';
const project='0a3be452-5152-41d1-a3e8-fc2be56d67e1',attempt='82b7e98a-8145-4020-882a-f6c7f61debe2',key='sk-test-secret-123456789012345';
const bindings={issue:()=> 'v1.test.signature',issueAction:()=> 'v2.test.signature'};
const request=(headers={})=>new Request('https://compor.vercel.app/api/agent',{method:'POST',headers:{'content-type':'application/json',origin:'https://compor.vercel.app','x-compor-project-id':project,'x-compor-attempt-id':attempt,...headers},body:JSON.stringify({apiKey:key,objective:'Oficina'})});

test('provedor simulado usa envelope para acessar somente o projeto autorizado', async()=>{
 const {createAgentScope,withAgentMcpTool}=await import('@compor/remote-mcp/agent-scope');
 const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',piece='33333333-3333-4333-8333-333333333333',token='mock-private-session';let reads=0;
 const scope=createAgentScope({secret:Buffer.alloc(32,9),authenticate:async value=>value===token?{userId:user}:null,ownsProject:async(actor,id)=>actor.userId===user&&id===project,pieceStore:{list:async()=>{reads++;return [];},save:async()=>({})}});
 const handler=createProjectAgentHandler({appOrigin:'https://compor.vercel.app',bindings,resolveActor:async()=>({userId:user,token}),ownsProject:async()=>true,
  attempts:{start:async()=>({id:attempt,state:'started',isNew:true}),finish:async()=>{}},
  withMcp:({actor,projectId},submit)=>withAgentMcpTool({appOrigin:'https://compor.vercel.app',scope,token:actor.token,projectId},submit),
  fetch:async(_url,options)=>{
   const sent=JSON.parse(options.body),tool=sent.agent.tools.find(value=>value.type==='mcp');assert.ok(tool);assert.doesNotMatch(options.body,/mock-private-session|sk-test-secret/);
   const call=async id=>{const req=new Request(tool.transport.server_url,{method:'POST',headers:{authorization:tool.transport.authorization,'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_piece_versions',arguments:{projectId:id,pieceId:piece}}})});return (await scope.handle(req)).json();};
   assert.equal((await call(other)).result.isError,true);assert.equal(reads,0);assert.deepEqual((await call(project)).result.structuredContent,{versions:[]});assert.equal(reads,1);
   return new Response('data: {"type":"agent.session.created","session":{"id":"sess_123"}}\n\ndata: {"type":"agent.session.turn.output_text.done","text":"Ideia"}\n\ndata: {"type":"agent.session.turn.completed"}\n\n',{status:201});
  },
 });
 const req=request({origin:'https://compor.vercel.app'});const response=await handler(req);assert.equal(response.status,200);assert.doesNotMatch(await response.text(),/mock-private-session|sk-test-secret/);
});
