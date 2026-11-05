import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioChatHandlers} from '../src/studio-chat.mjs';
import {createSessionBindings} from '../src/session-binding.mjs';
import {createStudioBindings} from '../src/studio-chat-bindings.mjs';

const userId='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333',attemptId='44444444-4444-4444-8444-444444444444',request2='55555555-5555-4555-8555-555555555555';
const apiKey='sk-synthetic_abcdefghijklmnopqrstuvwxyz',app='https://compor.test';
const request=(body,origin=app)=>new Request(app+'/api/studio/chat',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const body={apiKey,projectId,requestId,message:'Atualize a oferta para oficina fictícia',context:{revision:1,pieceId:null,brief:{offer:'Oficina'}},history:[]};
function fixture(options={}){
 const records=new Map(),calls=[],claims=new Map();let status='in_progress',actions=[],turn='turn_one',turnState='in_progress';
 const bindings=createSessionBindings({secret:Buffer.alloc(32,7)}),studioBindings=createStudioBindings({secret:Buffer.alloc(32,7)});
 const store={
  async reserve(c){if(records.has(c.requestId)){const t=records.get(c.requestId);return{status:t.inputDigest===c.inputDigest?'existing':'conflict',turn:t};}if([...records.values()].some(t=>!['completed','failed'].includes(t.state)))return{status:'busy'};const t={requestId:c.requestId,projectId,userId,attemptId:c.requestId===requestId?attemptId:request2,inputDigest:c.inputDigest,state:'starting',binding:null,turnId:null};records.set(c.requestId,t);return{status:'reserved',turn:t};},
  async get(c){return records.get(c.requestId)??null;},
  async bind(c){Object.assign(records.get(c.requestId),{binding:c.binding,expiresAt:c.expiresAt,priorTurnId:c.priorTurnId,initialInput:c.initialInput,initialOutput:c.initialOutput,state:'running'});},
  async state(c){const t=records.get(c.requestId);t.state=c.state;t.turnId=c.turnId??t.turnId;},
  async claimAction(c){const key=c.callId;if(claims.has(key))return{status:'existing',id:claims.get(key).id};claims.set(key,{id:request2,state:'sending'});return{status:'claimed',id:request2};},
  async finishAction(c){calls.push({kind:'receipt',state:c.state});for(const v of claims.values())if(v.id===c.submissionId)v.state=c.state;},
  async getAction(c){return claims.get(c.callId)??null;},
 };
 const fetch=async(url,init={})=>{
  calls.push({url,method:init.method??'GET',body:init.body?JSON.parse(init.body):null,headers:init.headers});
  if(url.endsWith('/sessions')&&init.method==='POST')return Response.json({id:'sess_one',status:'in_progress'},{status:201});
  if(url.endsWith('/events'))return new Response(null,{status:202});
  if(url.includes('/items?'))return Response.json({has_more:false,data:[{type:'message',role:'assistant',status:'completed',phase:'final_answer',turn_id:turn,content:[{type:'output_text',text:'Atualização concluída na aba.'}]}]});
  if(url.includes('/turns?'))return Response.json({has_more:false,data:[{id:turn,session_id:'sess_one',subagent_id:null,status:turnState},...(turn==='turn_two'?[{id:'turn_one',session_id:'sess_one',subagent_id:null,status:'completed'}]:[])]});
  return Response.json({id:'sess_one',status,required_actions:actions,usage:{input_tokens:100,output_tokens:20,total_tokens:120}});
 };
 const deps={appOrigin:app,resolveActor:async()=>({userId,token:'jwt-synthetic'}),ownsProject:async()=>true,ownsVersion:async()=>true,store,bindings,studioBindings,attempts:{async bindRecovery(){},async finish(){}},usage:{async start(){return true;},async finish(){}},fetch,...options};
 return{...createStudioChatHandlers(deps),calls,records,store,set:(v)=>{status=v.status??status;actions=v.actions??actions;turn=v.turn??turn;turnState=v.turnState??turnState;}};
}
test('submit cria uma sessão assíncrona e repetição consulta sem nova geração',async()=>{
 const f=fixture();let r=await f.chat(request(body));assert.equal(r.status,202);assert.equal((await r.json()).status,'running');
 assert.equal(f.calls.filter(c=>c.method==='POST'&&c.url?.endsWith('/sessions')).length,1);
 const create=f.calls.find(c=>c.url?.endsWith('/sessions'));assert.equal(create.body.stream,false);assert.equal(create.body.environment.type,'none');assert.equal('spend_control'in create.body,false);assert.ok(create.body.agent.tools.some(t=>t.type==='web_search'));
 assert.equal(JSON.parse(create.body.input[0].content[0].text).projectId,projectId);
 assert.equal(create.body.agent.tools.some(tool=>tool.type==='mcp'),false,'chat não oferece gravação MCP que contorne a confirmação da interface');
 r=await f.chat(request(body));assert.equal((await r.json()).status,'running');assert.equal(f.calls.filter(c=>c.method==='POST'&&c.url?.endsWith('/sessions')).length,1);
 f.set({status:'idle',turnState:'completed'});r=await f.chat(request({op:'poll',apiKey,projectId,requestId}));assert.equal((await r.json()).text,'Atualização concluída na aba.');
});
test('próxima mensagem reutiliza sessão ociosa e nunca direciona turno ativo',async()=>{
 const f=fixture();await f.chat(request(body));const busy=await f.chat(request({...body,requestId:request2}));assert.equal(busy.status,409);
 f.set({status:'idle',turnState:'completed'});await f.chat(request({op:'poll',apiKey,projectId,requestId}));
 const r=await f.chat(request({...body,requestId:request2,previousAttemptKey:requestId,message:'Agora atualize a data'}));assert.equal((await r.json()).sessionReused,true);
 const event=f.calls.find(c=>c.url?.endsWith('/events'));assert.equal(event.headers['Idempotency-Key'],request2);assert.equal(event.body.events[0].type,'agent.session.input.message');
 assert.equal(f.calls.filter(c=>c.url?.endsWith('/sessions')&&c.method==='POST').length,1);
 f.set({status:'idle',turnState:'completed',turn:'turn_two'});const done=await f.chat(request({op:'poll',apiKey,projectId,requestId:request2}));assert.equal((await done.json()).status,'completed');
});
test('function pendente vira ação assinada e só um resultado é enviado',async()=>{
 const f=fixture();await f.chat(request(body));const args={projectId,requestId,revision:1,field:'offer',value:'Oficina fictícia'};
 f.set({status:'requires_action',turnState:'waiting',actions:[{type:'function_call',name:'compor_editar_briefing',turn_id:'turn_one',call_id:'call_one',arguments:args}]});
 const pending=await(await f.chat(request({op:'poll',apiKey,projectId,requestId}))).json();assert.equal(pending.status,'action_required');assert.equal(pending.action.args.value,'Oficina fictícia');assert.ok(!pending.actionBinding.includes(apiKey));
 const actionBody={apiKey,projectId,requestId,actionBinding:pending.actionBinding,result:{status:'completed',revision:2}};
 assert.equal((await(await f.action(request(actionBody))).json()).status,'running');await f.action(request(actionBody));
 const sent=f.calls.filter(c=>c.url?.endsWith('/events'));assert.equal(sent.length,1);assert.equal(sent[0].body.events[0].call_id,'call_one');assert.equal(sent[0].body.events[0].success,true);
});
test('imagem exige contrato de consentimento e pode ser recusada sem chamar Images API',async()=>{
 const f=fixture();await f.chat(request(body));f.set({status:'requires_action',turnState:'waiting',actions:[{type:'function_call',name:'generate_image',turn_id:'turn_one',call_id:'call_image',arguments:{prompt:'Formas azuis'}}]});
 const pending=await(await f.chat(request({op:'poll',apiKey,projectId,requestId}))).json();assert.equal(pending.status,'consent_required');assert.ok(pending.actionBinding.startsWith('v2.'));assert.ok(pending.declineBinding.startsWith('s1.'));
 const invalid=await f.action(request({apiKey,projectId,requestId,actionBinding:pending.declineBinding,result:{status:'completed'}}));assert.equal(invalid.status,403);
 await f.action(request({apiKey,projectId,requestId,actionBinding:pending.declineBinding,result:{status:'declined'}}));assert.ok(f.calls.every(c=>!c.url?.includes('/images/')));
});
test('identidade, origem e input inválidos recusam antes da chamada paga',async()=>{
 const f=fixture();assert.equal((await f.chat(request(body,'https://foreign.test'))).status,403);assert.equal((await f.chat(request({...body,message:apiKey}))).status,400);assert.equal(f.calls.length,0);
 const denied=fixture({ownsProject:async()=>false});assert.equal((await denied.chat(request(body))).status,404);assert.equal(denied.calls.length,0);
});
test('timeout de criação permanece desconhecido e a tentativa não é reenviada',async()=>{
 let sends=0;const f=fixture({fetch:async()=>{sends++;throw Error('timeout');}});
 assert.equal((await(await f.chat(request(body))).json()).status,'unknown');assert.equal((await(await f.chat(request(body))).json()).status,'unknown');assert.equal(sends,1);
});
test('efeito local desconhecido não envia continuação ao agente',async()=>{
 const f=fixture();await f.chat(request(body));f.set({status:'requires_action',turnState:'waiting',actions:[{type:'function_call',name:'compor_novo_post',turn_id:'turn_one',call_id:'call_new',arguments:{projectId,requestId,revision:1}}]});
 const pending=await(await f.chat(request({op:'poll',apiKey,projectId,requestId}))).json();await f.action(request({apiKey,projectId,requestId,actionBinding:pending.actionBinding,result:{status:'unknown'}}));assert.equal(f.calls.filter(c=>c.url?.endsWith('/events')).length,0);assert.equal(f.records.get(requestId).state,'unknown');
});
test('ações da mesma mensagem recebem identificadores locais próprios e estáveis',async()=>{
 const f=fixture();await f.chat(request(body));const base={type:'function_call',name:'compor_novo_post',turn_id:'turn_one',arguments:{projectId,requestId,revision:1}};
 f.set({status:'requires_action',turnState:'waiting',actions:[{...base,call_id:'call_first'}]});
 const poll=()=>f.chat(request({op:'poll',apiKey,projectId,requestId})).then(r=>r.json());
 const first=await poll(),repeat=await poll();assert.equal(first.action.args.requestId,repeat.action.args.requestId);assert.notEqual(first.action.args.requestId,requestId);
 f.set({actions:[{...base,call_id:'call_second'}]});const second=await poll();assert.notEqual(first.action.args.requestId,second.action.args.requestId);
});
test('sessão expirada abre outra somente no novo pedido e inclui o histórico local',async()=>{
 const f=fixture();await f.chat(request(body));f.set({status:'idle',turnState:'completed'});await f.chat(request({op:'poll',apiKey,projectId,requestId}));
 f.records.get(requestId).expiresAt=new Date(Date.now()-1000).toISOString();
 const result=await(await f.chat(request({...body,requestId:request2,previousAttemptKey:requestId,history:[{role:'assistant',text:'Hipótese: pessoas iniciantes.'}]}))).json();
 assert.equal(result.sessionReused,false);const creates=f.calls.filter(c=>c.method==='POST'&&c.url?.endsWith('/sessions'));assert.equal(creates.length,2);
 assert.deepEqual(JSON.parse(creates[1].body.input[0].content[0].text).localConversation,[{role:'assistant',text:'Hipótese: pessoas iniciantes.'}]);
});
test('referências são somente PNG/JPEG base64, limitadas e enviadas como input_image',async()=>{
 const image={id:request2,mime:'image/png',data:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')};
 const f=fixture();assert.equal((await f.chat(request({...body,referenceImages:[{...image,data:'https://foreign.test/image.png'}]}))).status,400);
 assert.equal((await f.chat(request({...body,referenceImages:Array(22).fill(image)}))).status,400);assert.equal(f.calls.length,0);
 await f.chat(request({...body,referenceImages:[image]}));assert.equal(f.calls[0].body.input[0].content[2].type,'input_image');
});
test('rejeição definitiva permite novo pedido; resposta HTTP408 preserva a incerteza',async()=>{
 for(const [status,expected]of [[400,'failed'],[408,'unknown']]){
  const f=fixture({fetch:async()=>new Response(null,{status})});const result=await(await f.chat(request(body))).json();assert.equal(result.status,expected);assert.equal(f.records.get(requestId).state,expected);
 }
});
test('resultado persistente só continua se o servidor comprovar peça e versão',async()=>{
 const f=fixture({verifyDurableResult:async()=>false});await f.chat(request(body));f.set({status:'requires_action',turnState:'waiting',actions:[{type:'function_call',name:'compor_salvar_versao',turn_id:'turn_one',call_id:'call_save',arguments:{projectId,requestId,revision:1,pieceId:request2,baseVersion:0,expectedLatestVersion:0}}]});
 const pending=await(await f.chat(request({op:'poll',apiKey,projectId,requestId}))).json();
 const result=await(await f.action(request({apiKey,projectId,requestId,actionBinding:pending.actionBinding,result:{status:'completed',pieceId:request2,version:1}}))).json();assert.equal(result.status,'unknown');assert.equal(f.calls.filter(c=>c.url?.endsWith('/events')).length,0);
});
test('falha comprovada antes do envio libera somente a tentativa sem chamada paga',async()=>{
 const f=fixture({usage:{start:async()=>false,finish:async()=>{}}});
 const response=await f.chat(request(body)),result=await response.json();assert.equal(response.status,503);assert.equal(result.status,'failed');assert.equal(result.failurePhase,'before_submission');assert.equal(f.records.get(requestId).state,'failed');assert.equal(f.calls.length,0);
});
test('consulta de turno concluído permanece concluída quando a sessão exige ação de outro turno',async()=>{
 const f=fixture();await f.chat(request(body));f.set({status:'idle',turnState:'completed'});await f.chat(request({op:'poll',apiKey,projectId,requestId}));
 f.set({status:'requires_action',actions:[{type:'function_call',name:'generate_image',turn_id:'turn_newer',call_id:'call_newer',arguments:{prompt:'Outra mensagem'}}]});
 // required_actions describes the current session, not the historical turn.
 const result=await(await f.chat(request({op:'poll',apiKey,projectId,requestId}))).json();assert.equal(result.status,'completed');
 f.set({status:'failed',actions:[]});assert.equal((await(await f.chat(request({op:'poll',apiKey,projectId,requestId}))).json()).status,'completed');
});

test('poll distingue ausência de vínculo, assinatura inválida e falha de metadados sem revelar segredos',async t=>{
 const events=[],original=console.info;console.info=value=>events.push(value);t.after(()=>{console.info=original;});
 const f=fixture();await f.chat(request(body));
 const binding=f.records.get(requestId).binding;f.records.get(requestId).binding=null;
 let result=await(await f.chat(request({op:'poll',apiKey,projectId,requestId}))).json();
 assert.deepEqual(result,{status:'unknown',retryAutomatically:false,errorCode:'session_binding_missing',phase:'binding_missing',requestId,attemptId});
 f.records.get(requestId).binding='v4.invalid.signature';
 result=await(await f.chat(request({op:'poll',apiKey,projectId,requestId}))).json();assert.equal(result.phase,'binding_verify');assert.equal(result.errorCode,'session_binding_invalid');assert.equal('sessionId'in result,false);
 f.records.get(requestId).binding=binding;
 f.store.get=async()=>{throw Error(`PRIVATE_PROVIDER_BODY ${apiKey} ${body.message}`);};
 result=await(await f.chat(request({op:'poll',apiKey,projectId,requestId}))).json();assert.equal(result.phase,'store_get');assert.equal(result.requestId,requestId);assert.equal('attemptId'in result,false);assert.equal('sessionId'in result,false);
 assert.doesNotMatch(JSON.stringify({events,result}),/PRIVATE_PROVIDER_BODY|sk-synthetic|Atualize a oferta/);
 assert.ok(events.every(value=>/^COMPOR_STUDIO_EVENT unknown_[a-z_]+$/.test(value)));
});

test('poll inclui somente sessão com proveniência assinada e categoriza lookup/lista/status',async()=>{
 for(const [stage,expectedPhase,expectedCode]of [
  ['http','session_lookup','provider_http_404'],['body','session_lookup','provider_body_invalid'],
  ['session','session_validate','provider_session_invalid'],['list','turn_list_validate','provider_turn_list_invalid'],
  ['match','turn_match','provider_turn_unresolved'],['status','turn_status','provider_turn_status_invalid'],
 ]){
  let posts=0;const f=fixture({fetch:async(url,init={})=>{
   if(init.method==='POST'){posts++;return Response.json({id:'sess_one'});}
   if(url.includes('/turns?'))return Response.json(stage==='list'?{data:'PRIVATE_PROVIDER_BODY'}:stage==='match'?{data:[],has_more:true}:{data:[{id:'turn_one',session_id:'sess_one',subagent_id:null,status:stage==='status'?'PRIVATE_PROVIDER_BODY':'in_progress'}],has_more:false});
   if(stage==='http')return Response.json({error:{message:`PRIVATE_PROVIDER_BODY ${apiKey}`}},{status:404});
   if(stage==='body')return new Response(`PRIVATE_PROVIDER_BODY ${apiKey}`);
   return Response.json({id:stage==='session'?'sess_other':'sess_one',status:'in_progress',required_actions:[]});
  }});
  await f.chat(request(body));const result=await(await f.chat(request({op:'poll',apiKey,projectId,requestId}))).json();
  assert.equal(result.phase,expectedPhase,stage);assert.equal(result.errorCode,expectedCode,stage);assert.equal(result.sessionId,'sess_one');assert.equal(result.attemptId,attemptId);assert.equal(posts,1);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROVIDER_BODY|sk-synthetic/);
 }
});

test('falha de poll da tentativa existente mantém o bloqueio e não cria sessão nem a marca failed',async()=>{
 let posts=0;const f=fixture({fetch:async(url,init={})=>{if(init.method==='POST'){posts++;return Response.json({id:'sess_one'});}throw Error('PRIVATE lookup failure');}});
 await f.chat(request(body));const result=await(await f.chat(request(body))).json();
 assert.equal(result.status,'unknown');assert.equal(result.phase,'session_lookup');assert.equal(result.sessionId,'sess_one');assert.equal(f.records.get(requestId).state,'running');assert.equal(posts,1);
 const busy=await f.chat(request({...body,requestId:request2}));assert.equal(busy.status,409);assert.equal(posts,1);
});

test('criação incerta diferencia parsing e persistência sem expor sessão não comprovada',async()=>{
 for(const [response,phase,code]of [[new Response('PRIVATE_PROVIDER_BODY'),'provider_create_parse','provider_create_body_invalid'],[Response.json({session:'sess_unverified'}),'provider_create_validate','provider_session_id_invalid'],[new Response('PRIVATE_PROVIDER_BODY',{status:502}),'provider_create','provider_http_502']]){
  const f=fixture({fetch:async()=>response});const result=await(await f.chat(request(body))).json();
  assert.equal(result.status,'unknown');assert.equal(result.phase,phase);assert.equal(result.errorCode,code);assert.equal(result.requestId,requestId);assert.equal(result.attemptId,attemptId);assert.equal('sessionId'in result,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROVIDER_BODY/);
 }
 const f=fixture();f.store.bind=async()=>{throw Error(`PRIVATE_STORE ${apiKey}`);};
 const result=await(await f.chat(request(body))).json();assert.equal(result.phase,'session_bind');assert.equal(result.sessionId,'sess_one');assert.equal(result.attemptId,attemptId);assert.equal(f.records.get(requestId).state,'unknown');
});

test('falha ao registrar turno e resultado local desconhecido carregam referências técnicas',async()=>{
 const f=fixture();await f.chat(request(body));f.store.state=async()=>{throw Error(`PRIVATE_STATE ${apiKey}`);};
 const result=await(await f.chat(request({op:'poll',apiKey,projectId,requestId}))).json();assert.equal(result.phase,'turn_state_write');assert.equal(result.sessionId,'sess_one');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_STATE|sk-synthetic/);
 const g=fixture();await g.chat(request(body));g.set({status:'requires_action',turnState:'waiting',actions:[{type:'function_call',name:'compor_novo_post',turn_id:'turn_one',call_id:'call_new',arguments:{projectId,requestId,revision:1}}]});
 const pending=await(await g.chat(request({op:'poll',apiKey,projectId,requestId}))).json();
 const local=await(await g.action(request({apiKey,projectId,requestId,actionBinding:pending.actionBinding,result:{status:'unknown'}}))).json();
 assert.equal(local.phase,'action_local_unknown');assert.equal(local.requestId,requestId);assert.equal(local.attemptId,attemptId);assert.equal(local.sessionId,'sess_one');assert.equal(g.calls.filter(c=>c.url?.endsWith('/events')).length,0);
});
