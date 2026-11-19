import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createExplorationBatchRoute} from '../lib/exploration-batch-route.ts';
import {ExplorationBatchRejected} from '../lib/exploration-batch-coordinator.ts';
import {ExplorationCredentialsRejected} from '../lib/exploration-image-route.ts';
import {decodeExplorationImage} from '../lib/exploration-image-runtime.ts';
import {createImageHandler} from '../../../packages/images-api/src/index.mjs';
import {visualInputDigest} from '@compor/agents-api/visual-input';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),token:'token-synthetic'},origin='https://compor.test',key='sk-synthetic_abcdefghijklmnopqrstuvwxyz';
const plan={version:1,items:[1,2,3].map(position=>({position,creativePrompt:`Caminho ${position}`,composition:`Composição ${position}`,contrast:`Contraste ${position}`,differenceFromOthers:`Diferença ${position}`,prompt:`Prompt completo ${position}`}))};
const body={projectId:id(2),conversationId:'references',batchId:id(3),intentId:id(10),planRequestId:id(4),context:{idea:'Ideia sintética'},plan,planBinding:'signed-synthetic',imageIds:[id(5),id(6),id(7)]};
const request=(value=body,headers={},signal)=>new Request(origin+'/api/studio/exploration-batches/execute',{method:'POST',headers:{origin,'content-type':'application/json','x-compor-openai-key':key,...headers},body:JSON.stringify(value),signal});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
function fixture({visualEnabled=false,visualRequired=false,authorizeVisualInput}={}){const calls=[],pending=new Map(),state={reservation:{state:'running',isNew:true},permitted:true,proof:true,intent:'active',epoch:1};const store={
 reserveBatch:async(...args)=>{calls.push(['reserve',...args]);if(state.reservation.isNew)state.intent='consumed';return state.reservation;},
 replaceRejected:async(...args)=>{calls.push(['replace',...args]);if(state.reservation.isNew)state.intent='consumed';return state.reservation;},
 plan:async(a,p,id,value)=>{calls.push(['plan',id,value]);if(state.planGate)await state.planGate.promise;if(state.planGates?.get(id))await state.planGates.get(id).promise;},put:async(a,p,id,bytes)=>{calls.push(['put',id,bytes.length]);},
 finish:async(a,p,id,value,proof)=>{calls.push(['finish',id,value,proof]);},hold:async(a,p,id,proof,reason)=>{calls.push(['hold',id,proof,reason]);if(state.holdError)throw Error('lost receipt');},reject:async(a,p,id,proof)=>{calls.push(['reject',id,proof]);},
 };const route=createExplorationBatchRoute({appOrigin:origin,visualEnabled,visualRequired,
 prepareVisualAuthority:async input=>{calls.push(['authority',input]);if(state.authorityDenied)return null;if(input.visualInput.version===2&&input.visualInput.entries.some(entry=>entry.inputOrigin!=='local-upload')&&(!authorizeVisualInput||!await authorizeVisualInput(input)))return null;return {requestId:input.requestId,manifestDigest:visualInputDigest(input.visualInput),consentSecret:null};},
 checkVisualDispatch:async input=>{calls.push(['dispatchAuthority',input]);if(input.visualInput.version===2&&input.visualInput.entries.some(entry=>entry.inputOrigin!=='local-upload')&&authorizeVisualInput&&!await authorizeVisualInput(input))return false;return !state.intentError&&state.intent==='consumed'&&state.epoch===input.intentEpoch&&!state.dispatchDenied;},
 resolveActor:async()=>actor,ownsProject:async()=>state.permitted,verifyPlan:async input=>{state.lastVerify=input;return state.proof;},intentSecret:input=>{state.lastIntent=input;return 'a'.repeat(64);},intentState:async(value)=>{calls.push(['intentState',value]);if(state.intentError)throw Error('private database detail');return state.intentResult??{state:state.intent,epoch:state.epoch,revocationEpoch:state.intent==='revoked'?state.epoch:null};},store,generate:async(a,k,prompt,images,options)=>{calls.push(['generate',prompt,images]);if(state.generate)return state.generate(a,k,prompt,images,options);if(state.instant)return new Uint8Array([1]);const d=deferred();pending.set(prompt,d);return d.promise;}});return {route,calls,pending,state};}
const wait=async(predicate)=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,1));}throw Error('condition not reached');};
function visualFixture(){
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
 const sha256=createHash('sha256').update(bytes).digest('hex'),original={sha256,mime:'image/png',byteLength:bytes.length};
 const entries=[1,2].map((ordinal)=>({id:id(100+ordinal),ordinal,role:'reference',inputOrigin:'local-upload',original,transport:{...original,width:1,height:1},transformation:'none'}));
 return {visualInput:{version:1,policy:'optimized-v1',entries},referenceImages:entries.map(entry=>({id:entry.id,mime:'image/png',data:bytes.toString('base64')}))};
}

test('as três chamadas usam o conjunto de PNGs validado na ordem e vinculam manifesto à prova',async()=>{
 const f=fixture({visualEnabled:true}),visual=visualFixture(),promise=f.route.post(request({...body,...visual}));await wait(()=>f.pending.size===3);
 assert.deepEqual(f.state.lastVerify.visualInput,visual.visualInput);assert.deepEqual(f.state.lastIntent.visualInput,visual.visualInput);
 const dispatched=f.calls.filter(call=>call[0]==='generate');assert.equal(dispatched.length,3);for(const call of dispatched)assert.deepEqual(call[2],visual.referenceImages);
 for(const pos of [3,1,2])f.pending.get(`Prompt completo ${pos}`).resolve(new Uint8Array([1]));
 const result=await (await promise).json();assert.equal(result.status,'completed');assert.doesNotMatch(JSON.stringify(result),/iVBOR|local-upload/);
});
test('autoridade visual ausente ou revogada bloqueia reserva; revogação posterior bloqueia os três envios',async()=>{
 const visual=visualFixture();
 const denied=fixture({visualEnabled:true});denied.state.authorityDenied=true;
 assert.equal((await denied.route.post(request({...body,...visual}))).status,403);
 assert.equal(denied.calls.some(call=>call[0]==='reserve'||call[0]==='generate'),false);
 const revoked=fixture({visualEnabled:true});revoked.state.instant=true;revoked.state.dispatchDenied=true;
 const response=await revoked.route.post(request({...body,...visual},{'x-compor-reference-consent':'capability-synthetic'}));
 assert.equal((await response.json()).status,'unknown');
 assert.equal(revoked.calls.filter(call=>call[0]==='generate').length,0);
 assert.equal(revoked.calls.filter(call=>call[0]==='finish'&&call[2]==='unknown').length,3);
 const reserve=revoked.calls.find(call=>call[0]==='reserve')[2];
 assert.deepEqual(reserve.visualAuthority,{requestId:body.planRequestId,manifestDigest:visualInputDigest(visual.visualInput),consentSecret:null});
 assert.ok(revoked.calls.filter(call=>call[0]==='dispatchAuthority').every(call=>call[1].intentEpoch===1&&call[1].purpose==='parallel'));
});
test('flag visual obrigatória bloqueia batch e reposição legados sem reservar',async()=>{
 const f=fixture({visualEnabled:true,visualRequired:true}),{imageIds,...base}=body;
 assert.equal((await f.route.post(request(body))).status,503);
 assert.equal((await f.route.replace(request({...base,position:1,previousId:imageIds[0],requestId:id(8)}))).status,503);
 assert.equal(f.calls.some(call=>call[0]==='reserve'||call[0]==='replace'||call[0]==='generate'),false);
});
test('omissão, bytes trocados, ordem incorreta ou flag desligada não reservam nem geram',async()=>{
 const visual=visualFixture();
 for(const changed of [{visualInput:visual.visualInput},{...visual,referenceImages:[...visual.referenceImages].reverse()},{...visual,referenceImages:visual.referenceImages.map((entry,index)=>index?entry:{...entry,data:entry.data.slice(0,-4)+'AAAA'})}]){
  const f=fixture({visualEnabled:true});const response=await f.route.post(request({...body,...changed}));assert.equal(response.status,400);assert.equal(f.calls.some(call=>call[0]==='reserve'||call[0]==='generate'),false);
 }
 const f=fixture();assert.equal((await f.route.post(request({...body,...visual}))).status,503);assert.equal(f.calls.some(call=>call[0]==='reserve'||call[0]==='generate'),false);
});
test('reposição preserva mesmo digest visual e envia apenas o filho escolhido',async()=>{
 const visual=visualFixture(),batch=fixture({visualEnabled:true});batch.state.instant=true;await batch.route.post(request({...body,...visual}));
 const original=batch.calls.find(call=>call[0]==='reserve')[2],{imageIds,...base}=body;
 const f=fixture({visualEnabled:true});f.state.instant=true;const response=await f.route.replace(request({...base,...visual,position:2,previousId:imageIds[1],requestId:id(8)}));
 assert.equal((await response.json()).status,'completed');assert.equal(f.calls.find(call=>call[0]==='replace')[2].promptDigest,original.promptDigests[1]);
 assert.deepEqual(f.calls.filter(call=>call[0]==='generate').map(call=>call[2]),[visual.referenceImages]);
});
test('revisão local retém somente os slots sem aprovação e também cobre a reposição', async()=>{
 const imageBase64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==';
 const handler=createImageHandler({
  authenticate:async()=>actor,
  fetch:async()=>Response.json({data:[{b64_json:imageBase64}]}),
  reviewCandidate:async({prompt})=>prompt===plan.items[0].prompt?{decision:'approve',findings:[]}:{decision:'unsure',findings:[]},
 });
 const generate=async(_actor,apiKey,prompt)=>decodeExplorationImage(await handler(request({apiKey,prompt,authorizeGeneration:true})));
 const batch=fixture();batch.state.generate=generate;
 const result=await (await batch.route.post(request())).json();
 assert.equal(result.status,'partial');
 assert.equal(result.retryAutomatically,false);
 assert.deepEqual(result.images.map(item=>item.status),['completed','quality_held','quality_held']);
 assert.deepEqual(batch.calls.filter(call=>call[0]==='put').map(call=>call[1]),[body.imageIds[0]]);
 assert.equal(batch.calls.filter(call=>call[0]==='generate').length,3);
 const held=batch.calls.filter(call=>call[0]==='hold');
 const {rejectionDigests}=batch.calls.find(call=>call[0]==='reserve')[2];
 assert.deepEqual(held.map(([,id,proof,reason])=>[id,createHash('sha256').update(Buffer.from(proof,'hex')).digest('hex'),reason]),[
  [body.imageIds[1],rejectionDigests[1],'image_quality_inconclusive'],
  [body.imageIds[2],rejectionDigests[2],'image_quality_inconclusive'],
 ]);
 assert.ok(!batch.calls.some(call=>call[0]==='reject'));


 const replacement=fixture(),{imageIds,...base}=body;replacement.state.generate=generate;
 const replaced=await (await replacement.route.replace(request({...base,position:2,previousId:imageIds[1],requestId:id(8)}))).json();
 assert.equal(replaced.status,'quality_held');
 assert.equal(replaced.qualityReason,'image_quality_inconclusive');
 assert.equal(replaced.retryAutomatically,false);
 assert.equal(replacement.calls.filter(call=>call[0]==='generate').length,1);
 assert.ok(!replacement.calls.some(call=>call[0]==='put'));
 assert.ok(!replacement.calls.some(call=>call[0]==='reject'));
 const unconfirmed=fixture();unconfirmed.state.generate=generate;unconfirmed.state.holdError=true;
 const lost=await (await unconfirmed.route.replace(request({...base,position:2,previousId:imageIds[1],requestId:id(8)}))).json();
 assert.equal(lost.status,'unknown');
 assert.ok(!unconfirmed.calls.some(call=>call[0]==='put'));
});
test('v2 exige autorização das fontes e envia só a triagem assinada junto aos uploads',async()=>{
 const visual=visualFixture(),[local,external]=visual.visualInput.entries;
 visual.visualInput={version:2,policy:'optimized-v1',externalConsent:true,entries:[{...local,source:null},{...external,inputOrigin:'external',source:{originUrl:'https://www.pinterest.com/pin/synthetic/',board:'behance/advertising'}}]};
 const signedPlan={...plan,version:2,referenceIds:[local.id]};
 const value={...body,plan:signedPlan,visualInput:visual.visualInput,referenceImages:[visual.referenceImages[0]]};
 const denied=fixture({visualEnabled:true});assert.equal((await denied.route.post(request(value))).status,403);assert.equal(denied.calls.some(call=>call[0]==='reserve'||call[0]==='generate'),false);
 const allowed=fixture({visualEnabled:true,authorizeVisualInput:async({actor:who,projectId,conversationId,visualInput})=>who===actor&&projectId===body.projectId&&conversationId==='references'&&visualInput.version===2});allowed.state.instant=true;
 assert.equal((await (await allowed.route.post(request(value))).json()).status,'completed');
 assert.equal(allowed.calls.filter(call=>call[0]==='generate').length,3);for(const call of allowed.calls.filter(call=>call[0]==='generate'))assert.deepEqual(call[2],[visual.referenceImages[0]]);
 const invalid=fixture({visualEnabled:true,authorizeVisualInput:async()=>true});const bad={...value,plan:{...signedPlan,referenceIds:[external.id]},referenceImages:[visual.referenceImages[1]]};
 assert.equal((await invalid.route.post(request(bad))).status,400);assert.equal(invalid.calls.some(call=>call[0]==='reserve'||call[0]==='generate'),false);
});
test('perda da autorização de fonte durante reserva impede filhos ainda não enviados',async()=>{
 const visual=visualFixture(),[local,external]=visual.visualInput.entries;
 visual.visualInput={version:2,policy:'optimized-v1',externalConsent:true,entries:[{...local,source:null},{...external,inputOrigin:'external',source:{originUrl:'https://www.pinterest.com/pin/synthetic/',board:'behance/advertising'}}]};
 let authorized=true;const f=fixture({visualEnabled:true,authorizeVisualInput:async()=>authorized});f.state.instant=true;f.state.planGate=deferred();
 const pending=f.route.post(request({...body,...visual,plan:{...plan,version:2,referenceIds:[local.id,external.id]}}));await wait(()=>f.calls.filter(call=>call[0]==='plan').length===3);
 authorized=false;f.state.planGate.resolve();const result=await (await pending).json();assert.equal(result.status,'unknown');assert.equal(f.calls.filter(call=>call[0]==='generate').length,0);assert.equal(f.calls.filter(call=>call[0]==='finish'&&call[2]==='unknown').length,3);
});

for(const operation of ['post','replace'])test(`revogação durante autoridade visual impede ${operation} antes do envio`,async()=>{
 const visual=visualFixture(),[local,external]=visual.visualInput.entries;
 visual.visualInput={version:2,policy:'optimized-v1',externalConsent:true,entries:[{...local,source:null},{...external,inputOrigin:'external',source:{originUrl:'https://www.pinterest.com/pin/synthetic/',board:'behance/advertising'}}]};
 const authorization=deferred();let checks=0;
 const f=fixture({visualEnabled:true,authorizeVisualInput:async()=>{checks++;if(checks>1)await authorization.promise;return true;}});f.state.instant=true;
 const {imageIds,...base}=body;
 const value={...base,...visual,plan:{...plan,version:2,referenceIds:[local.id,external.id]},...(operation==='post'?{imageIds}:{position:2,previousId:imageIds[1],requestId:id(8)})};
 const children=operation==='post'?3:1,pending=f.route[operation](request(value));
 await wait(()=>checks===children+1);
 f.state.intent='revoked';f.state.epoch++;authorization.resolve();
 const result=await (await pending).json();assert.equal(result.status,'unknown');
 assert.equal(f.calls.filter(call=>call[0]==='generate').length,0);
 assert.equal(f.calls.filter(call=>call[0]==='finish'&&call[2]==='unknown').length,children);
 // A lost/unknown reservation remains a receipt, never permission to resend.
 f.state.reservation={state:'unknown',isNew:false};
 const replay=await f.route[operation](request(value));assert.equal(replay.status,409);
 assert.equal((await replay.json()).status,'unknown');assert.equal(f.calls.filter(call=>call[0]==='generate').length,0);
});

test('revogação durante plan bloqueia as três imagens e preserva as reservas desconhecidas',async()=>{
 const f=fixture();f.state.instant=true;f.state.planGate=deferred();
 const pending=f.route.post(request());await wait(()=>f.calls.filter(c=>c[0]==='plan').length===3);
 f.state.intent='revoked';f.state.epoch++;f.state.planGate.resolve();
 const result=await (await pending).json();assert.equal(result.status,'unknown');assert.equal(f.calls.filter(c=>c[0]==='generate').length,0);assert.equal(f.calls.filter(c=>c[0]==='finish'&&c[2]==='unknown').length,3);
});

test('leitura inicial indisponível não reserva e usa identidade e escopo autenticados',async()=>{
 const f=fixture();f.state.intentError=true;
 const response=await f.route.post(request());assert.equal(response.status,503);assert.equal((await response.json()).status,'unknown');
 assert.deepEqual(f.calls.filter(c=>c[0]==='intentState').map(c=>c[1]),[{actor,projectId:body.projectId,intentId:body.intentId}]);
 assert.equal(f.calls.some(c=>c[0]==='reserve'||c[0]==='generate'),false);
});

test('reposição falha fechada após plan quando intent foi revogada ou epoch mudou',async()=>{
 const {imageIds,...base}=body,replacement={...base,position:2,previousId:imageIds[1],requestId:id(8)};
 for(const change of [state=>{state.intent='revoked';state.epoch++;},state=>{state.epoch++;},state=>{state.intentError=true;},state=>{state.intentResult={state:'consumed',epoch:'invalid'};}]){
  const f=fixture();f.state.instant=true;f.state.planGate=deferred();const pending=f.route.replace(request(replacement));await wait(()=>f.calls.some(c=>c[0]==='plan'));change(f.state);f.state.planGate.resolve();
  const result=await (await pending).json();assert.equal(result.status,'unknown');assert.equal(f.calls.filter(c=>c[0]==='generate').length,0);assert.equal(f.calls.filter(c=>c[0]==='finish'&&c[2]==='unknown').length,1);assert.doesNotMatch(JSON.stringify(result),/private database detail/);
 }
});

test('revogação impede filhos ainda não enviados sem perder o recibo já iniciado',async()=>{
 const f=fixture();f.state.planGates=new Map([[id(6),deferred()],[id(7),deferred()]]);
 const pending=f.route.post(request());await wait(()=>f.pending.has('Prompt completo 1')&&f.calls.filter(c=>c[0]==='plan').length===3);
 f.state.intent='revoked';f.state.epoch++;f.state.planGates.get(id(6)).resolve();f.state.planGates.get(id(7)).resolve();f.pending.get('Prompt completo 1').resolve(new Uint8Array([1]));
 const result=await (await pending).json();assert.deepEqual(result.images.map(x=>x.status),['completed','unknown','unknown']);assert.equal(f.calls.filter(c=>c[0]==='generate').length,1);assert.equal(f.calls.filter(c=>c[0]==='finish'&&c[2]==='completed').length,1);
});

test('uma reserva atômica válida inicia as três imagens e confirma independentemente',async()=>{
 const f=fixture(),promise=f.route.post(request());await wait(()=>f.pending.size===3);
 assert.equal(f.calls.filter(c=>c[0]==='reserve').length,1);assert.equal(f.calls.filter(c=>c[0]==='generate').length,3);
 for(const pos of [3,1,2])f.pending.get(`Prompt completo ${pos}`).resolve(new Uint8Array([137,80,78,71,13,10,26,10]));
 const response=await promise,result=await response.json();assert.equal(response.status,200);assert.equal(result.status,'completed');assert.deepEqual(result.images.map(x=>x.status),['completed','completed','completed']);
 assert.equal(f.calls.filter(c=>c[0]==='finish'&&c[2]==='completed').length,3);assert.doesNotMatch(JSON.stringify(result),/sk-synthetic|signed-synthetic|Prompt completo/);
 const reserved=f.calls.find(c=>c[0]==='reserve')[2];
 for(const [index,imageId] of body.imageIds.entries()){
  const proof=f.calls.find(c=>c[0]==='finish'&&c[1]===imageId)[3];
  assert.equal(reserved.rejectionDigests[index],createHash('sha256').update(Buffer.from(proof,'hex')).digest('hex'),'prova deve usar bytes originais como as RPCs');
 }
});

test('reposição explícita somente reserva um novo filho e não reenvia os demais',async()=>{
 const {imageIds,...base}=body;const f=fixture(),replacement={...base,position:2,previousId:imageIds[1],requestId:id(8)};
 const pending=f.route.replace(request(replacement));await wait(()=>f.pending.size===1);
 assert.deepEqual(f.calls.filter(call=>call[0]==='generate').map(call=>call[1]),['Prompt completo 2']);
 const reserved=f.calls.find(call=>call[0]==='replace')[2];assert.equal(reserved.previousId,id(6));assert.equal(reserved.requestId,id(8));
 f.pending.get('Prompt completo 2').resolve(new Uint8Array([1]));const response=await pending,result=await response.json();
 assert.equal(result.status,'completed');assert.equal(result.requestId,id(8));
 const proof=f.calls.find(call=>call[0]==='finish')[3];assert.equal(reserved.rejectionDigest,createHash('sha256').update(Buffer.from(proof,'hex')).digest('hex'));
 f.state.reservation={state:'running',isNew:false};const replay=await f.route.replace(request(replacement));assert.equal(replay.status,409);assert.equal(f.calls.filter(call=>call[0]==='generate').length,1);
});
test('reposição interrompe em prova inválida e preserva rejeição ou incerteza sem repetir',async()=>{
 const {imageIds,...base}=body,replacement={...base,position:2,previousId:imageIds[1],requestId:id(8)};
 const denied=fixture();denied.state.proof=false;assert.equal((await denied.route.replace(request(replacement))).status,403);assert.deepEqual(denied.calls,[]);
 for(const [error,expected] of [[new ExplorationCredentialsRejected(),'rejected'],[Error('transport uncertain'),'unknown']]){
  const f=fixture(),pending=f.route.replace(request(replacement));await wait(()=>f.pending.size===1);f.pending.get('Prompt completo 2').reject(error);
  assert.equal((await (await pending).json()).status,expected);assert.equal(f.calls.filter(call=>call[0]==='generate').length,1);
  assert.equal(f.calls.some(call=>call[0]===(expected==='rejected'?'reject':'finish')),true);
 }
});

test('reserva repetida nunca despacha nem reemite capacidade',async()=>{
 const f=fixture();f.state.reservation={state:'running',isNew:false};const response=await f.route.post(request()),result=await response.json();
 assert.equal(response.status,409);assert.equal(result.status,'running');assert.equal(f.calls.filter(c=>c[0]==='generate').length,0);
});
test('abortar após reserva e antes do envio não inicia imagens e conserva incerteza',async()=>{
 const f=fixture(),controller=new AbortController();f.state.planGate=deferred();
 const pending=f.route.post(request(body,{},controller.signal));await wait(()=>f.calls.filter(c=>c[0]==='plan').length===3);
 controller.abort();f.state.planGate.resolve();const response=await pending,result=await response.json();
 assert.equal(result.status,'unknown');assert.equal(f.calls.filter(c=>c[0]==='generate').length,0);
 assert.equal(f.calls.filter(c=>c[0]==='finish'&&c[2]==='unknown').length,3);
});
test('abortar após um envio não inventa cancelamento e impede envios ainda pendentes',async()=>{
 const f=fixture(),controller=new AbortController(),gate=deferred();f.state.planGates=new Map([[id(6),gate],[id(7),gate]]);
 const pending=f.route.post(request(body,{},controller.signal));await wait(()=>f.pending.size===1);
 controller.abort();gate.resolve();f.pending.get('Prompt completo 1').resolve(new Uint8Array([1]));
 const result=await (await pending).json();assert.deepEqual(result.images.map(x=>x.status),['completed','unknown','unknown']);
 assert.equal(f.calls.filter(c=>c[0]==='generate').length,1);
});

test('prova ou propriedade incorreta não reserva nem gera',async()=>{
 for(const field of ['permitted','proof']){const f=fixture();f.state[field]=false;const response=await f.route.post(request());assert.ok([403,404].includes(response.status));assert.deepEqual(f.calls,[]);}
});

test('sucesso parcial e rejeição/unknown são preservados sem reenvio',async()=>{
 const f=fixture(),promise=f.route.post(request());await wait(()=>f.pending.size===3);
 f.pending.get('Prompt completo 1').resolve(new Uint8Array([1]));f.pending.get('Prompt completo 2').reject(new ExplorationBatchRejected());f.pending.get('Prompt completo 3').reject(Error('private provider details'));
 const response=await promise,result=await response.json();assert.equal(response.status,200);assert.equal(result.status,'unknown');assert.deepEqual(result.images.map(x=>x.status),['completed','rejected','unknown']);
 assert.equal(f.calls.filter(c=>c[0]==='generate').length,3);assert.ok(f.calls.some(c=>c[0]==='reject'&&c[1]===id(6)));assert.doesNotMatch(JSON.stringify(result),/private provider/);
});

test('origem inválida e ids duplicados falham antes de reservar',async()=>{
 const f=fixture();assert.equal((await f.route.post(request(body,{origin:'https://evil.test'}))).status,403);
 assert.equal((await f.route.post(request({...body,imageIds:[id(5),id(5),id(7)]}))).status,400);assert.deepEqual(f.calls,[]);
});

test('resposta perdida da reserva ou forma inválida nunca autoriza geração',async()=>{
 const f=fixture();f.state.reservation={state:'completed',isNew:true};
 let response=await f.route.post(request());assert.equal(response.status,503);assert.equal((await response.json()).status,'unknown');
 assert.equal(f.calls.filter(c=>c[0]==='generate').length,0);
 const g=fixture();g.state.reservation={state:'unexpected',isNew:true};
 response=await g.route.post(request());assert.equal(response.status,503);assert.equal((await response.json()).status,'unknown');
 assert.equal(g.calls.filter(c=>c[0]==='generate').length,0);
});
