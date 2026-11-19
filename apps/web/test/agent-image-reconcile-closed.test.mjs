import test from 'node:test';
import assert from 'node:assert/strict';
import {createClosedImageReconciliation} from '../lib/agent-image-reconcile-closed.ts';
import {createImageToolReservationStore} from '../../../packages/agents-api/src/image-tool-reservation.mjs';

const actor={userId:'11111111-1111-4111-8111-111111111111',token:'synthetic'};
const projectId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333';
const req=(body={projectId,requestId},origin='https://compor.test')=>new Request('https://compor.test/api/agent/image/reconcile-closed',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});

test('verifica somente a tentativa da conta autenticada e preserva incerteza',async()=>{
 const calls=[];
 const handler=createClosedImageReconciliation({appOrigin:'https://compor.test',resolveActor:async()=>actor,confirm:async value=>{calls.push(value);return {status:'confirmed'};}});
 assert.deepEqual(await (await handler(req())).json(),{status:'confirmed'});
 assert.deepEqual(calls,[{actor,projectId,requestId}]);
 assert.equal((await handler(req({projectId,requestId,apiKey:'unexpected'}))).status,400);
 assert.equal((await handler(req(undefined,'https://elsewhere.test'))).status,403);
 const anonymous=createClosedImageReconciliation({appOrigin:'https://compor.test',resolveActor:async()=>null,confirm:async()=>{throw Error('unexpected')}});
 assert.equal((await anonymous(req())).status,401);
 const unavailable=createClosedImageReconciliation({appOrigin:'https://compor.test',resolveActor:async()=>actor,confirm:async()=>{throw Error('unknown')}});
 assert.deepEqual(await (await unavailable(req())).json(),{status:'unverified'});
});

test('expõe encerramento confirmado sem despacho com tipo distinto do turno concluído',async()=>{
 const store=createImageToolReservationStore({url:'https://supabase.test',anonKey:'sb_publishable_fixture',fetch:async(url,options)=>{
  assert.equal(url.pathname,'/rest/v1/rpc/confirm_closed_image_attempt');
  assert.equal(options.headers.authorization,'Bearer synthetic');
  assert.deepEqual(JSON.parse(options.body),{p_project_id:projectId,p_request_id:requestId});
  return Response.json('failed_without_dispatch');
 }});
 const handler=createClosedImageReconciliation({appOrigin:'https://compor.test',resolveActor:async()=>actor,confirm:store.confirmClosedAttempt});
 assert.deepEqual(await (await handler(req())).json(),{status:'confirmed',outcome:'failed_without_dispatch'});
});

test('retenção após despacho tem recibo de encerramento próprio sem imagem',async()=>{
 const store=createImageToolReservationStore({url:'https://supabase.test',anonKey:'sb_publishable_fixture',fetch:async()=>Response.json('image_quality_inconclusive')});
 const handler=createClosedImageReconciliation({appOrigin:'https://compor.test',resolveActor:async()=>actor,confirm:store.confirmClosedAttempt});
 assert.deepEqual(await (await handler(req())).json(),{status:'confirmed',outcome:'quality_held',qualityReason:'image_quality_inconclusive'});
});
