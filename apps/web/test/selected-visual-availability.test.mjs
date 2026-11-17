import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeLocalVisualInput,selectedVisualsAvailable} from '../lib/selected-visual-availability.ts';
import {createStudioChatHandlers} from '@compor/agents-api/studio-chat';
import {createSessionBindings} from '@compor/agents-api/session-binding';
import {createStudioBindings} from '@compor/agents-api/studio-chat-bindings';
import {createHash} from 'node:crypto';
import {visualInputDigest} from '@compor/agents-api/visual-input';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const file={sha256:'a'.repeat(64),mime:'image/png',byteLength:42};
const entry=n=>({id:id(n),ordinal:n,role:'reference',inputOrigin:'local-upload',source:null,original:file,transport:{...file,width:1,height:1},transformation:'none'});
const visualInput={version:2,policy:'optimized-v1',externalConsent:false,entries:[entry(1),entry(2)]};
const reference=n=>({id:id(n),source:{kind:'local-upload'}});

test('disponibilidade depende das flags de imagens selecionadas e autoridade, autenticação, chat, imagens e assinatura',()=>{
 const env={COMPOR_SELECTED_LOCAL_VISUALS_ENABLED:'true',COMPOR_REFERENCE_AUTHORITY_ENABLED:'true',COMPOR_STUDIO_CHAT_ENABLED:'true',COMPOR_PRIVATE_IMAGES_ENABLED:'true',COMPOR_AGENT_ENABLED:'true',COMPOR_AGENT_HMAC_SECRET:Buffer.alloc(32,7).toString('base64url')};
 assert.equal(selectedVisualsAvailable(true,env),true);assert.equal(selectedVisualsAvailable(false,env),false);
 for(const key of Object.keys(env))assert.equal(selectedVisualsAvailable(true,{...env,[key]:''}),false,key);
 assert.equal(selectedVisualsAvailable(true,{}),false);
});

test('handler autenticado valida snapshot e recusa extras antes de reservar ou chamar o modelo',async()=>{
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
 const metadata={sha256:createHash('sha256').update(bytes).digest('hex'),mime:'image/png',byteLength:bytes.length};
 const input={version:2,policy:'optimized-v1',externalConsent:false,entries:[{...entry(1),original:metadata,transport:{...metadata,width:1,height:1}}]};
 const body={apiKey:'sk-synthetic_abcdefghijklmnopqrstuvwxyz',projectId:id(8),requestId:id(9),conversationId:id(7),message:'Criar arte',context:{revision:1,pieceId:id(7),references:[reference(1)]},visualInput:input,visualImages:[{id:id(1),mime:'image/png',data:bytes.toString('base64')}]};
 const calls=[],record={attemptId:id(10),state:'starting',binding:null};
 const store={async reserve(){calls.push('reserve');return {status:'reserved',turn:record};},async get(){return record;},async bind(){},async state(){},async claimAction(){},async finishAction(){},async getAction(){}};
 const handler=createStudioChatHandlers({appOrigin:'https://compor.test',resolveActor:async()=>({userId:id(6),token:'jwt'}),ownsProject:async()=>true,selectedVisualsEnabled:true,authorizeVisualInput:authorizeLocalVisualInput,prepareVisualAuthority:async input=>({pieceId:input.conversationId,manifestDigest:visualInputDigest(input.visualInput),consentSecret:null}),checkVisualAuthority:async()=>true,store,attempts:{async bindRecovery(){},async finish(){}},bindings:createSessionBindings({secret:Buffer.alloc(32,7)}),studioBindings:createStudioBindings({secret:Buffer.alloc(32,7)}),fetch:async(_url,options)=>{calls.push(JSON.parse(options.body));return Response.json({id:'sess_test'},{status:201});}});
 const request=value=>new Request('https://compor.test/api/studio/chat',{method:'POST',headers:{origin:'https://compor.test','content-type':'application/json'},body:JSON.stringify(value)});
 const extra={...body,context:{...body.context,references:[reference(1),{id:id(2),source:{kind:'generated',projectId:id(8),imageId:id(3)}}]}};
 assert.equal((await handler.chat(request(extra))).status,400);assert.deepEqual(calls,[]);
 assert.equal((await handler.chat(request({...body,visualImages:[]}))).status,400);assert.deepEqual(calls,[]);
 assert.equal((await handler.chat(request(body))).status,202);assert.equal(calls[0],'reserve');
 assert.equal(calls[1].input[0].content.find(item=>item.type==='input_image').image_url,`data:image/png;base64,${bytes.toString('base64')}`);
});

test('autoriza somente seleção local completa em ordem e recusa extras ou ausência',async()=>{
 const authorize=references=>authorizeLocalVisualInput({context:{references},visualInput});
 assert.equal(await authorize([reference(1),reference(2)]),true);
 assert.equal(await authorize([reference(1)]),false);
 assert.equal(await authorize([reference(2),reference(1)]),false);
 assert.equal(await authorize([reference(1),reference(2),{id:id(3),source:{originUrl:'https://www.pinterest.com/pin/123/',board:'x/y'}}]),false);
 assert.equal(await authorize([reference(1),reference(2),{id:id(3),source:{kind:'generated',projectId:id(4),imageId:id(5)}}]),false);
 assert.equal(await authorize([reference(1),reference(2),{id:id(3)}]),true,'origem legada permanece desconhecida e não é incluída');
 assert.equal(await authorizeLocalVisualInput({context:{},visualInput}),false);
});
