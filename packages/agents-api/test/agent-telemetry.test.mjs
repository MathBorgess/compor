import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectAgentHandler} from '../src/project-route.mjs';
import {recordAgentEvent,recordProviderStatus} from '../src/telemetry.mjs';

const projectId='11111111-1111-4111-8111-111111111111', attemptId='22222222-2222-4222-8222-222222222222', key='sk-private-synthetic-123456789012345';
const request=()=>new Request('https://compor.test/api/agent',{method:'POST',headers:{origin:'https://compor.test','content-type':'application/json','x-compor-project-id':projectId,'x-compor-attempt-id':attemptId},body:JSON.stringify({apiKey:key,objective:'SENSITIVE_OBJECTIVE'})});
const base={appOrigin:'https://compor.test',resolveActor:async()=>({userId:'synthetic-user',token:'synthetic-jwt'}),ownsProject:async()=>true,bindings:{issue:()=> 'proof',issueAction:()=> 'proof'},attempts:{start:async()=>({id:attemptId,state:'started',isNew:true}),finish:async()=>{}},usage:{start:async()=>true,finish:async()=>{}}};
async function capture(run){const previous=console.info, events=[];console.info=(...args)=>events.push(args.join(' '));try{await run(events);}finally{console.info=previous;}}

test('registra marcos e status 400 do provedor sem credenciais ou conteúdo',async()=>capture(async events=>{
 let sent=0;
 const handler=createProjectAgentHandler({...base,fetch:async(_url,options)=>{sent++;assert.equal(options.method,'POST');return new Response('SENSITIVE_PROVIDER_BODY',{status:400});}});
 const result=await handler(request());assert.equal(result.status,502);assert.deepEqual(await result.json(),{error:'result_unknown',retryAutomatically:false});assert.equal(sent,1);
 for(const stage of ['attempt_reserved','usage_reserved','provider_create_dispatched','provider_create_http_400'])assert.ok(events.includes(`COMPOR_AGENT_EVENT ${stage}`),stage);
 assert.doesNotMatch(events.join('\n'),/sk-private|SENSITIVE|synthetic-jwt|11111111|22222222/);
}));

test('reserva indisponível interrompe antes do provedor e não registra detalhes da exceção',async()=>capture(async events=>{
 let sent=0;
 const handler=createProjectAgentHandler({...base,attempts:{...base.attempts,start:async()=>{throw Error('SENSITIVE_EXCEPTION');}},fetch:async()=>{sent++;throw Error();}});
 assert.equal((await handler(request())).status,503);assert.equal(sent,0);assert.ok(events.includes('COMPOR_AGENT_EVENT attempt_reservation_failed'));assert.doesNotMatch(events.join('\n'),/SENSITIVE/);
}));

test('medição indisponível interrompe antes do provedor',async()=>capture(async events=>{
 let sent=0;const handler=createProjectAgentHandler({...base,usage:{...base.usage,start:async()=>false},fetch:async()=>{sent++;throw Error();}});
 assert.equal((await handler(request())).status,503);assert.equal(sent,0);assert.ok(events.includes('COMPOR_AGENT_EVENT usage_reservation_failed'));
}));

test('telemetria recusa texto arbitrário e limita status desconhecido a categoria fixa',async()=>capture(async events=>{
 recordAgentEvent('SENSITIVE_OBJECTIVE');recordProviderStatus('SENSITIVE_PROVIDER_BODY',400);recordProviderStatus('provider_create_http',599);
 assert.deepEqual(events,['COMPOR_AGENT_EVENT provider_create_http_other']);
}));

test('classifica somente código, tipo e parâmetro reconhecidos sem registrar mensagem',async()=>capture(async events=>{
 const handler=createProjectAgentHandler({...base,fetch:async()=>Response.json({error:{code:'unknown_parameter',type:'invalid_request_error',param:'spend_control',message:`SENSITIVE_OBJECTIVE ${key} synthetic-jwt`}}, {status:400})});
 const result=await handler(request());
 assert.equal(result.status,502);assert.deepEqual(await result.json(),{error:'result_unknown',retryAutomatically:false});
 for(const event of ['provider_error_code_unknown_parameter','provider_error_type_invalid_request_error','provider_error_param_spend_control'])assert.ok(events.includes(`COMPOR_AGENT_EVENT ${event}`),event);
 assert.doesNotMatch(events.join('\n'),/SENSITIVE|sk-private|synthetic-jwt/);
}));

test('dados desconhecidos, campos maliciosos ou corpo grande produzem somente other',async()=>{
 for(const content of [
  JSON.stringify({error:{code:`unknown_parameter ${key}`,type:'arbitrary',param:`spend_control.${key}`,message:'SENSITIVE'}}),
  JSON.stringify({error:{code:'unknown_parameter',type:'invalid_request_error',param:'spend_control',message:'X'.repeat(5000)+'SENSITIVE'}}),
  '{broken SENSITIVE',
 ]) await capture(async events=>{
  const handler=createProjectAgentHandler({...base,fetch:async()=>new Response(content,{status:400})});
  const result=await handler(request());assert.equal(result.status,502);assert.deepEqual(await result.json(),{error:'result_unknown',retryAutomatically:false});
  for(const suffix of ['code_other','type_other','param_other'])assert.ok(events.includes(`COMPOR_AGENT_EVENT provider_error_${suffix}`),suffix);
  assert.doesNotMatch(events.join('\n'),/SENSITIVE|sk-private|unknown_parameter|spend_control|arbitrary/);
 });
});

test('corpo de erro que não termina não retarda indefinidamente nem provoca repetição',async()=>capture(async events=>{
 let sent=0;
 const stalled=new ReadableStream({pull(){return new Promise(()=>{});}});
 const handler=createProjectAgentHandler({...base,fetch:async()=>{sent++;return new Response(stalled,{status:400});}});
 const result=await handler(request());assert.equal(result.status,502);assert.equal(sent,1);
 assert.ok(events.includes('COMPOR_AGENT_EVENT provider_error_code_other'));
}));

test('credencial recusada e limitação preservam os retornos anteriores',async()=>{
 for(const status of [401,403,429]) await capture(async events=>{
  const handler=createProjectAgentHandler({...base,fetch:async()=>Response.json({error:{type:'invalid_request_error',message:'SENSITIVE'}},{status})});
  const result=await handler(request());assert.equal(result.status,status);
  assert.deepEqual(await result.json(),{error:status===429?'openai_quota_or_rate_limit':'openai_credentials_rejected'});
  assert.doesNotMatch(events.join('\n'),/SENSITIVE/);
 });
});
