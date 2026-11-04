import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBindings } from '../src/session-binding.mjs';
import { createProjectAgentHandler } from '../src/project-route.mjs';
import { createHash } from 'node:crypto';
const userId='11111111-1111-4111-8111-111111111111', projectId='22222222-2222-4222-8222-222222222222', attemptId='33333333-3333-4333-8333-333333333333', idempotencyKey='44444444-4444-4444-8444-444444444444';
const apiKey='sk-test-secret-123456789012345';
const request = () => new Request('https://compor.test/api/agent', { method: 'POST', headers: { origin:'https://compor.test', 'content-type':'application/json', 'x-compor-project-id':projectId, 'x-compor-attempt-id':idempotencyKey }, body: JSON.stringify({ apiKey, objective:'Oficina', sessionId:'sess_browser_forged', callId:'call_browser_forged' }) });
const action={ type:'function_call', name:'generate_image', turn_id:'turn_123', call_id:'call_123', arguments:{ prompt:'Foto sem texto' } };
const encode = new TextEncoder();

test('ação pendente é verificada no provedor, vinculada cedo e espera consentimento sem encerrar tentativa', async () => {
  let now = 1000000, cancelled = false; const calls = [], finished = [];
  const bindings = createSessionBindings({ secret:Buffer.alloc(32,42), now:()=>now });
  const handler = createProjectAgentHandler({ appOrigin:'https://compor.test', resolveActor:async()=>({ userId, token:'fake-user-token' }), ownsProject:async()=>true, bindings,
    attempts:{ start:async()=>({ id:attemptId,state:'started',isNew:true }), finish:async ({state})=>finished.push(state) },
    fetch: async (url, options) => {
      calls.push({ url:String(url), method:options.method, auth:options.headers.Authorization });
      if (options.method === 'POST') {
        const sent=JSON.parse(options.body); assert.ok(sent.agent.tools.some(tool=>tool.name==='generate_image')); assert.doesNotMatch(options.body,/sk-test-secret/);
        return new Response(new ReadableStream({ start(controller) { controller.enqueue(encode.encode('data: {"type":"agent.session.created","session":{"id":"sess_actual"}}\n\n')); controller.enqueue(encode.encode('data: {"type":"agent.session.requires_action","session":{"id":"sess_actual"}}\n\n')); }, cancel() { cancelled=true; } }), { status:201 });
      }
      return Response.json({ id:'sess_actual', status:'requires_action', required_actions:[{ ...action, arguments: JSON.stringify(action.arguments) }] });
    },
  });
  const response = await Promise.race([handler(request()), new Promise((_,reject)=>setTimeout(()=>reject(new Error('leitura não foi incremental')),1500))]);
  assert.equal(response.status,202); const data=await response.json();
  assert.equal(data.status,'consent_required'); assert.equal(data.prompt,'Foto sem texto');
  assert.deepEqual(finished, []); assert.equal(cancelled,true);
  assert.deepEqual(calls.map(call=>call.method),['POST','GET']); assert.ok(calls.every(call=>call.auth===`Bearer ${apiKey}`));
  assert.equal(calls[1].url,'https://api.openai.com/v1/agents/sessions/sess_actual');
  assert.doesNotMatch(JSON.stringify(data), /sk-test-secret|fake-user-token|sess_browser_forged|call_browser_forged/);
  const context={ userId,projectId,attemptId };
  assert.deepEqual(bindings.verifyAction({token:data.actionBinding,...context}),{...context,sessionId:'sess_actual',turnId:'turn_123',callId:'call_123',promptDigest:createHash('sha256').update('Foto sem texto').digest('hex')});
  assert.equal(bindings.verifyAction({token:data.actionBinding,...context,userId:'55555555-5555-4555-8555-555555555555'}),null);
  const [v,payload,signature]=data.actionBinding.split('.'); const changed=JSON.parse(Buffer.from(payload,'base64url')); changed.callId='call_browser_forged';
  assert.equal(bindings.verifyAction({token:`${v}.${Buffer.from(JSON.stringify(changed)).toString('base64url')}.${signature}`,...context}),null);
  now+=11*60*1000; assert.equal(bindings.verifyAction({token:data.actionBinding,...context}),null);
});

test('consulta pendente inconsistente termina incerta e não informa chave nem executa tool', async () => {
  const finished=[]; let count=0;
  const bindings=createSessionBindings({ secret:Buffer.alloc(32,42) });
  const handler=createProjectAgentHandler({ appOrigin:'https://compor.test', resolveActor:async()=>({userId,token:'fake-token'}), ownsProject:async()=>true, bindings,
    attempts:{start:async()=>({id:attemptId,state:'started',isNew:true}),finish:async({state})=>finished.push(state)},
    fetch:async (_url,options)=>{ count++; if(options.method==='POST') return new Response('data: {"type":"agent.session.created","session":{"id":"sess_actual"}}\n\ndata: {"type":"agent.session.requires_action","session":{"id":"sess_actual"}}\n\n',{status:201}); return Response.json({ id:'sess_other',status:'requires_action',required_actions:[action] }); },
  });
  const response=await handler(request()); assert.equal(response.status,502); const body=await response.text();
  assert.doesNotMatch(body,/sk-test-secret|Foto sem texto/); assert.deepEqual(finished,['unknown']); assert.equal(count,2);
});
