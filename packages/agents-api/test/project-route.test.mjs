import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectAgentHandler } from '../src/project-route.mjs';

const project = '0a3be452-5152-41d1-a3e8-fc2be56d67e1';
const attempt = '82b7e98a-8145-4020-882a-f6c7f61debe2';
const key = 'sk-test-secret-123456789012345';
const bindings = { issue: () => 'v1.test.signature', issueAction: () => 'v2.test.signature' };
const request = (headers = {}, body = { apiKey: key, objective: 'Oficina' }) => new Request('https://compor.test/api/agent', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://compor.test', 'x-compor-project-id': project, 'x-compor-attempt-id': attempt, ...headers }, body: JSON.stringify(body) });

test('MCP delegado exige medição durável antes do envio pago', async()=>{
 const steps=[];let recordedUsage;
 const handler=createProjectAgentHandler({appOrigin:'https://compor.test',bindings,resolveActor:async()=>({userId:'alice',token:'fake-token'}),ownsProject:async()=>true,
  attempts:{start:async()=>({id:attempt,state:'started',isNew:true}),finish:async()=>steps.push('attempt-finish')},
  usage:{start:async()=>{steps.push('usage-start');return true;},finish:async({usage})=>{recordedUsage=usage;steps.push('usage-finish');}},
  withMcp:async(_context,submit)=>{steps.push('delegate');await submit({type:'mcp',transport:{authorization:'Bearer opaque'}});return {status:'invoked'};},
  fetch:async(_url,options)=>{if(options.method==='GET')return Response.json({id:'sess_123',status:'idle',required_actions:[],usage:{input_tokens:100,output_tokens:50,total_tokens:150}});steps.push('provider');return new Response('data: {"type":"agent.session.created","session":{"id":"sess_123"}}\n\ndata: {"type":"agent.session.turn.output_text.done","turn_id":"turn_root","text":"Ideia"}\n\ndata: {"type":"agent.session.turn.completed","turn":{"id":"turn_root","subagent_id":null}}\n\n',{status:201});}
 });
 assert.equal((await handler(request())).status,200);assert.deepEqual(steps,['usage-start','delegate','provider','usage-finish','attempt-finish']);assert.deepEqual(recordedUsage,{input_tokens:100,output_tokens:50,total_tokens:150});
});

test('conexão opcional envia apenas credencial MCP opaca à sessão e não retorna segredo', async () => {
 const token='user-session-secret',grant='opaque-delegated-token'; let sent;
 const handler=createProjectAgentHandler({appOrigin:'https://compor.test',bindings,resolveActor:async()=>({userId:'alice',token}),ownsProject:async()=>true,
  attempts:{start:async()=>({id:attempt,state:'started',isNew:true}),finish:async()=>{}},
  withMcp:async({actor,projectId},submit)=>{assert.equal(actor.token,token);assert.equal(projectId,project);await submit({type:'mcp',server_label:'compor',connection_origin:'service',transport:{type:'http',server_url:'https://compor.vercel.app/api/agent-mcp',authorization:`Bearer ${grant}`}});return {status:'invoked'};},
  fetch:async(_url,options)=>{if(options.method==='GET')return Response.json({id:'sess_123',status:'idle',required_actions:[]});sent=JSON.parse(options.body);assert.doesNotMatch(options.body,new RegExp(token));return new Response('data: {"type":"agent.session.created","session":{"id":"sess_123"}}\n\ndata: {"type":"agent.session.turn.output_text.done","turn_id":"turn_root","text":"Ideia opaque-delegated-token"}\n\ndata: {"type":"agent.session.turn.completed","turn":{"id":"turn_root","subagent_id":null}}\n\n',{status:201});},
 });
 const response=await handler(request());const body=await response.text();
 assert.equal(response.status,200);assert.doesNotMatch(body,/opaque-delegated-token|user-session-secret|sk-test-secret/);
 assert.equal(sent.agent.tools.find(tool=>tool.type==='mcp').transport.authorization,`Bearer ${grant}`);
 assert.ok(sent.agent.tools.some(tool=>tool.name==='generate_image'));
});

test('falha de concessão MCP não inicia agente pago', async()=>{
 let calls=0;
 const handler=createProjectAgentHandler({appOrigin:'https://compor.test',bindings,resolveActor:async()=>({userId:'alice',token:'mock'}),ownsProject:async()=>true,
  attempts:{start:async()=>({id:attempt,state:'started',isNew:true}),finish:async()=>{}},withMcp:async()=>({status:'unavailable'}),fetch:async()=>{calls++;throw Error();}});
 assert.equal((await handler(request())).status,503);assert.equal(calls,0);
});

test('não chama o agente pago quando não consegue reservar medição durável',async()=>{
 let calls=0;
 const handler=createProjectAgentHandler({appOrigin:'https://compor.test',bindings,resolveActor:async()=>({userId:'alice',token:'fake-token'}),ownsProject:async()=>true,attempts:{start:async()=>({id:attempt,state:'started',isNew:true}),finish:async()=>{}},usage:{start:async()=>false,finish:async()=>{}},fetch:async()=>{calls++;throw Error();}});
 assert.equal((await handler(request())).status,503);assert.equal(calls,0);
});

test('criador autenticado inicia tentativa antes da geração para seu projeto', async () => {
  const steps = [];
  const handler = createProjectAgentHandler({
    appOrigin: 'https://compor.test',
    bindings,
    resolveActor: async () => ({ userId: 'alice', token: 'fake-session-token' }),
    ownsProject: async ({ actor, projectId }) => { assert.equal(actor.userId, 'alice'); assert.equal(projectId, project); return true; },
    attempts: { start: async args => { assert.doesNotMatch(JSON.stringify(args), /sk-test-secret|Oficina/); steps.push('start'); return { id: attempt, state: 'started', isNew: true }; }, finish: async ({ state }) => { steps.push(state); } },
    fetch: async (_url, options) => { assert.equal(options.headers.Authorization, `Bearer ${key}`); if(options.method==='GET')return Response.json({id:'sess_123',status:'idle',required_actions:[]}); steps.push('provider'); return new Response('data: {"type":"agent.session.created","session":{"id":"sess_123"}}\n\ndata: {"type":"agent.session.turn.output_text.done","turn_id":"turn_root","text":"Ideia"}\n\ndata: {"type":"agent.session.turn.completed","turn":{"id":"turn_root","subagent_id":null}}\n\n', { status: 201 }); },
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(steps, ['start', 'provider', 'completed']);
  assert.equal((await response.json()).text, 'Ideia');
});

test('não chama o provedor sem origem, usuário, projeto autorizado ou registro durável', async () => {
  let calls = 0;
  const base = { appOrigin: 'https://compor.test', bindings, resolveActor: async () => ({ userId: 'alice', token: 'fake-token' }), ownsProject: async () => true,
    attempts: { start: async () => ({ id: attempt, state: 'started', isNew: true }), finish: async () => {} }, fetch: async () => { calls++; throw new Error('not expected'); } };
  assert.equal((await createProjectAgentHandler(base)(request({ origin: 'https://evil.test' }))).status, 403);
  assert.equal((await createProjectAgentHandler({ ...base, resolveActor: async () => null })(request())).status, 401);
  assert.equal((await createProjectAgentHandler({ ...base, ownsProject: async () => false })(request())).status, 403);
  assert.equal((await createProjectAgentHandler({ ...base, attempts: undefined })(request())).status, 503);
  assert.equal((await createProjectAgentHandler({ ...base, attempts: { ...base.attempts, start: async () => { throw Error(); } } })(request())).status, 503);
  assert.equal(calls, 0);
});

test('desconexão gera resultado desconhecido e jamais repete chamada automaticamente', async () => {
  let calls = 0;
  const states = [];
  const handler = createProjectAgentHandler({ appOrigin: 'https://compor.test', bindings, resolveActor: async () => ({ userId: 'alice', token: 'fake-token' }), ownsProject: async () => true,
    attempts: { start: async () => ({ id: attempt, state: 'started', isNew: true }), finish: async ({ state }) => states.push(state) }, fetch: async () => { calls++; throw Error(key); } });
  const response = await handler(request());
  const result = await response.text();
  assert.equal(response.status, 502);
  assert.deepEqual(JSON.parse(result), { error: 'result_unknown', retryAutomatically: false });
  assert.doesNotMatch(result, /sk-test-secret/);
  assert.deepEqual(states, ['unknown']);
  assert.equal(calls, 1);
});

test('falha ao registrar o desfecho não apresenta resultado como conclusão', async () => {
  const handler = createProjectAgentHandler({ appOrigin: 'https://compor.test', bindings, resolveActor: async () => ({ userId: 'alice', token: 'fake-token' }), ownsProject: async () => true,
    attempts: { start: async () => ({ id: attempt, state: 'started', isNew: true }), finish: async () => { throw Error(); } }, fetch: async () => new Response('data: {"type":"agent.session.created","session":{"id":"sess_123"}}\n\ndata: {"type":"agent.session.turn.output_text.done","turn_id":"turn_root","text":"Ideia"}\n\ndata: {"type":"agent.session.turn.completed","turn":{"id":"turn_root","subagent_id":null}}\n\n', { status: 201 }) });
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'result_unknown', retryAutomatically: false });
});

test('repetir uma tentativa existente nunca executa outra chamada paga', async () => {
  let calls = 0;
  const handler = createProjectAgentHandler({ appOrigin: 'https://compor.test', bindings, resolveActor: async () => ({ userId: 'alice', token: 'fake-token' }), ownsProject: async () => true,
    attempts: { start: async () => ({ id: attempt, state: 'unknown', isNew: false }), finish: async () => { throw Error(); } }, fetch: async () => { calls++; throw Error(); } });
  const response = await handler(request());
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'attempt_exists', state: 'unknown', retryAutomatically: false });
  assert.equal(calls, 0);
});
