import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBindings } from '../src/session-binding.mjs';
import { createProjectAgentHandler } from '../src/project-route.mjs';
import { createAgentHandler } from '../src/index.mjs';
import { createHash } from 'node:crypto';
const userId='11111111-1111-4111-8111-111111111111', projectId='22222222-2222-4222-8222-222222222222', attemptId='33333333-3333-4333-8333-333333333333', idempotencyKey='44444444-4444-4444-8444-444444444444';
const apiKey='sk-test-secret-123456789012345';
const request = () => new Request('https://compor.test/api/agent', { method: 'POST', headers: { origin:'https://compor.test', 'content-type':'application/json', 'x-compor-project-id':projectId, 'x-compor-attempt-id':idempotencyKey }, body: JSON.stringify({ apiKey, objective:'Oficina', sessionId:'sess_browser_forged', callId:'call_browser_forged' }) });
const action={ type:'function_call', name:'generate_image', turn_id:'turn_123', call_id:'call_123', arguments:{ prompt:'Foto sem texto' } };
const encode = new TextEncoder();

test('ação pendente é verificada no provedor, vinculada cedo e espera consentimento sem encerrar tentativa', async () => {
  let now = 1000000, cancelled = false, agentSignal; const calls = [], finished = [], measurements=[];
  const bindings = createSessionBindings({ secret:Buffer.alloc(32,42), now:()=>now });
  const handler = createProjectAgentHandler({ appOrigin:'https://compor.test', resolveActor:async()=>({ userId, token:'fake-user-token' }), ownsProject:async()=>true, bindings,
    attempts:{ start:async()=>({ id:attemptId,state:'started',isNew:true }), finish:async ({state})=>finished.push(state) },
    usage:{start:async x=>{measurements.push({event:'start',part:x.part});return true;},finish:async x=>measurements.push({event:'finish',state:x.state})},
    fetch: async (url, options) => {
      calls.push({ url:String(url), method:options.method, auth:options.headers.Authorization });
      if (options.method === 'POST') {
        const sent=JSON.parse(options.body); const imageTool=sent.agent.tools.find(tool=>tool.name==='generate_image'); assert.ok(imageTool); assert.doesNotMatch(options.body,/sk-test-secret/);
        assert.match(sent.agent.instructions,/chame generate_image/); assert.match(sent.agent.instructions,/sem esperar confirmação antes dessa chamada/);
        assert.match(sent.agent.instructions,/não gera a imagem nem inicia a Images API/); assert.match(sent.agent.instructions,/pedirá confirmação explícita antes da geração de imagem/);
        assert.match(sent.agent.instructions,/turno do agente pode gerar custo/); assert.match(imageTool.description,/não gera a imagem/); assert.match(imageTool.description,/aprovação explícita antes de iniciar a geração/);
        agentSignal = options.signal;
        return new Response(new ReadableStream({ start(controller) { controller.enqueue(encode.encode('data: {"type":"agent.session.created","session":{"id":"sess_actual"}}\n\n')); controller.enqueue(encode.encode('data: {"type":"agent.session.requires_action","session":{"id":"sess_actual"}}\n\n')); }, cancel() { cancelled=true; return new Promise(() => {}); } }), { status:201 });
      }
      assert.equal(agentSignal.aborted, true);
      return Response.json({ id:'sess_actual', status:'requires_action', required_actions:[{ ...action, arguments: JSON.stringify(action.arguments) }] });
    },
  });
  const response = await Promise.race([handler(request()), new Promise((_,reject)=>setTimeout(()=>reject(new Error('leitura não foi incremental')),1500))]);
  assert.equal(response.status,202); const data=await response.json();
  assert.equal(data.status,'consent_required'); assert.equal(data.prompt,'Foto sem texto'); assert.equal(data.attemptId,attemptId);
  assert.deepEqual(finished, []); assert.deepEqual(measurements,[{event:'start',part:'agent'}]); assert.equal(cancelled,true);
  assert.deepEqual(calls.map(call=>call.method),['POST','GET']); assert.ok(calls.every(call=>call.auth===`Bearer ${apiKey}`));
  assert.equal(calls[0].url,'https://api.openai.com/v1/agents/sessions'); assert.equal(calls[1].url,'https://api.openai.com/v1/agents/sessions/sess_actual');
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

test('timeout ao consultar sessão após ação mantém tentativa e custo desconhecidos, sem repetir envio', async () => {
 const finished=[], measurements=[], calls=[];
 const handler=createProjectAgentHandler({appOrigin:'https://compor.test',resolveActor:async()=>({userId,token:'fake-token'}),ownsProject:async()=>true,
  bindings:createSessionBindings({secret:Buffer.alloc(32,42)}),
  attempts:{start:async()=>({id:attemptId,state:'started',isNew:true}),finish:async({state})=>finished.push(state)},
  usage:{start:async()=>true,finish:async({state,usage})=>measurements.push({state,usage})},
  fetch:async(_url,options)=>{calls.push(options.method);if(options.method==='POST')return new Response('data: {"type":"agent.session.created","session":{"id":"sess_actual"}}\n\ndata: {"type":"agent.session.requires_action","session":{"id":"sess_actual"}}\n\n',{status:201});assert.ok(options.signal instanceof AbortSignal);throw new DOMException('simulated timeout','TimeoutError');},
 });
 const result=await handler(request());assert.equal(result.status,502);assert.deepEqual(await result.json(),{error:'result_unknown',retryAutomatically:false});
 assert.deepEqual(calls,['POST','GET']);assert.deepEqual(finished,['unknown']);assert.deepEqual(measurements,[{state:'unknown',usage:null}]);
});

test('timeout com falha de persistência não transforma started em sucesso nem repete envio', async () => {
 let attemptState=null, measurementState=null;const calls=[], requested=[];
 const handler=createProjectAgentHandler({appOrigin:'https://compor.test',resolveActor:async()=>({userId,token:'fake-token'}),ownsProject:async()=>true,
  bindings:createSessionBindings({secret:Buffer.alloc(32,42)}),
  attempts:{start:async()=>{attemptState='started';return {id:attemptId,state:attemptState,isNew:true};},finish:async({state})=>{requested.push(['attempt',state]);throw Error('persistence unavailable');}},
  usage:{start:async()=>{measurementState='started';return true;},finish:async({state})=>{requested.push(['measurement',state]);throw Error('persistence unavailable');}},
  fetch:async(_url,options)=>{calls.push(options.method);if(options.method==='POST')return new Response('data: {"type":"agent.session.created","session":{"id":"sess_actual"}}\n\ndata: {"type":"agent.session.requires_action","session":{"id":"sess_actual"}}\n\n',{status:201});throw new DOMException('simulated timeout','TimeoutError');},
 });
 const result=await handler(request());assert.equal(result.status,502);assert.deepEqual(await result.json(),{error:'result_unknown',retryAutomatically:false});
 assert.deepEqual(calls,['POST','GET']);assert.deepEqual(requested,[['measurement','unknown'],['attempt','unknown']]);assert.equal(attemptState,'started');assert.equal(measurementState,'started');
});

test('reconcilia sessão após stream textual e recupera chamada de imagem não observada', async () => {
  const calls=[];
  const handler=createAgentHandler({ authenticate:async()=>({userId}),enableImageTool:true,fetch:async (_url,options)=>{
    calls.push(options.method);
    if(options.method==='POST') {const sent=JSON.parse(options.body);assert.match(sent.agent.instructions,/generate_image/);return new Response('data: {"type":"agent.session.created","session":{"id":"sess_actual"}}\n\ndata: {"type":"agent.session.turn.output_text.done","turn_id":"turn_root","text":"Vou criar."}\n\ndata: {"type":"agent.session.turn.completed","turn":{"id":"turn_root","subagent_id":null}}\n\n',{status:201});}
    return Response.json({id:'sess_actual',status:'requires_action',required_actions:[action]});
  }});
  const result=await handler(request());assert.equal(result.status,202);assert.equal((await result.json()).status,'consent_required');assert.deepEqual(calls,['POST','GET']);
});

test('não devolve texto como concluído se sessão não puder ser reconciliada',async()=>{
  const handler=createAgentHandler({authenticate:async()=>({userId}),enableImageTool:true,fetch:async(_url,options)=>options.method==='POST' ? new Response('data: {"type":"agent.session.created","session":{"id":"sess_actual"}}\n\ndata: {"type":"agent.session.turn.output_text.done","turn_id":"turn_root","text":"Vou criar."}\n\ndata: {"type":"agent.session.turn.completed","turn":{"id":"turn_root","subagent_id":null}}\n\n',{status:201}) : new Response('',{status:503})});
  const result=await handler(request());assert.equal(result.status,502);
});

test('sessão ainda em andamento não é apresentada como texto final',async()=>{
  const handler=createAgentHandler({authenticate:async()=>({userId}),enableImageTool:true,fetch:async(_url,options)=>options.method==='POST' ? new Response('data: {"type":"agent.session.created","session":{"id":"sess_actual"}}\n\ndata: {"type":"agent.session.turn.output_text.done","turn_id":"turn_root","text":"Vou criar."}\n\ndata: {"type":"agent.session.turn.completed","turn":{"id":"turn_root","subagent_id":null}}\n\n',{status:201}) : Response.json({id:'sess_actual',status:'in_progress',required_actions:[]})});
  const result=await handler(request());assert.equal(result.status,502);
});

test('retorna somente texto do turno principal e usage sanitizado da sessão',async()=>{
 const events=[
  {type:'agent.session.created',session:{id:'sess_actual'}},
  {type:'agent.session.turn.created',turn:{id:'turn_sub',subagent_id:'sub_1'}},
  {type:'agent.session.turn.output_text.done',turn_id:'turn_sub',item_id:'msg_sub',text:'SUBAGENT_TEXT'},
  {type:'agent.session.turn.completed',turn:{id:'turn_sub',subagent_id:'sub_1'}},
  {type:'agent.session.turn.created',turn:{id:'turn_root',subagent_id:null}},
  {type:'agent.session.turn.output_text.done',turn_id:'turn_root',item_id:'msg_root',text:'ROOT_TEXT'},
  {type:'agent.session.turn.completed',turn:{id:'turn_root',subagent_id:null}},
 ].map(event=>`data: ${JSON.stringify(event)}\n\n`).join('');
 const handler=createAgentHandler({authenticate:async()=>({userId}),enableImageTool:true,fetch:async(_url,options)=>options.method==='POST'?new Response(events,{status:201}):Response.json({id:'sess_actual',status:'idle',required_actions:[],usage:{input_tokens:100,output_tokens:50,total_tokens:150,unsafe:'SECRET'}})});
 const response=await handler(request());assert.equal(response.status,200);const result=await response.json();assert.equal(result.text,'ROOT_TEXT');assert.deepEqual(result.usage,{input_tokens:100,output_tokens:50,total_tokens:150});assert.doesNotMatch(JSON.stringify(result),/SUBAGENT_TEXT|SECRET/);
});

test('usage ausente ou inválido permanece desconhecido e texto sem vínculo não se mistura',async()=>{
 const events=[{type:'agent.session.created',session:{id:'sess_actual'}},{type:'agent.session.turn.output_text.done',turn_id:null,item_id:'msg_1',text:'UNTAGGED'},{type:'agent.session.turn.output_text.done',turn_id:'turn_root',item_id:'msg_2',text:'ROOT'},{type:'agent.session.turn.completed',turn:{id:'turn_root',subagent_id:null}}].map(event=>`data: ${JSON.stringify(event)}\n\n`).join('');
 const handler=createAgentHandler({authenticate:async()=>({userId}),enableImageTool:true,fetch:async(_url,options)=>options.method==='POST'?new Response(events,{status:201}):Response.json({id:'sess_actual',status:'idle',required_actions:[],usage:{input_tokens:-1,output_tokens:'42',total_tokens:1e12}})});
 const response=await handler(request());assert.equal(response.status,200);const result=await response.json();assert.equal(result.text,'ROOT');assert.equal(result.usage,null);
});

test('conclusão de subagente não comprova término do turno principal',async()=>{
  const handler=createAgentHandler({authenticate:async()=>({userId}),fetch:async()=>new Response('data: {"type":"agent.session.created","session":{"id":"sess_actual"}}\n\ndata: {"type":"agent.session.turn.output_text.done","text":"Texto intermediário"}\n\ndata: {"type":"agent.session.turn.completed","turn":{"subagent_id":"sub_123"}}\n\n',{status:201})});
  const result=await handler(request());assert.equal(result.status,502);
});

test('evento de conclusão sem identificação do turno não comprova conclusão',async()=>{
 const handler=createAgentHandler({authenticate:async()=>({userId}),fetch:async()=>new Response('data: {"type":"agent.session.created","session":{"id":"sess_actual"}}\n\ndata: {"type":"agent.session.turn.output_text.done","turn_id":"turn_root","text":"texto"}\n\ndata: {"type":"agent.session.turn.completed"}\n\n',{status:201})});
 assert.equal((await handler(request())).status,502);
});
