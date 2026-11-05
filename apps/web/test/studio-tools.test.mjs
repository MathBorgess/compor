import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioTools } from '../lib/studio-tools.mjs';
const userId='11111111-1111-4111-8111-111111111111', projectId='22222222-2222-4222-8222-222222222222', requestId='33333333-3333-4333-8333-333333333333';
const args={projectId,revision:1,requestId,field:'offer',value:'Curso fictício'};
test('chat e WebMCP usam o mesmo efeito e repetição não duplica alteração',async()=>{
 let calls=0,scope={userId,projectId,revision:1}; const tools=createStudioTools({getScope:()=>scope,handlers:{compor_editar_briefing:async()=>{calls++;scope={...scope,revision:2};return {status:'completed'};}}});
 assert.equal((await tools.execute('compor_editar_briefing',args)).status,'completed');
 assert.equal((await tools.execute('compor_editar_briefing',args)).status,'completed');assert.equal(calls,1);
 await assert.rejects(()=>tools.execute('compor_editar_briefing',{...args,value:'Outro'}),/action_conflict/);
 const native=[];const registration=await tools.register({registerTool:async(d,o)=>native.push({d,o})});
 assert.equal(registration.native,true);assert.ok(native.length>0);registration.dispose();assert.ok(native.every(t=>t.o.signal.aborted));
});
test('contexto alterado, credencial e schema inesperado são recusados antes do efeito',async()=>{
 let calls=0;const tools=createStudioTools({getScope:()=>({userId,projectId,revision:2}),handlers:{compor_editar_briefing:()=>{calls++;return {status:'completed'};}}});
 await assert.rejects(()=>tools.execute('compor_editar_briefing',args),/context_changed/);
 await assert.rejects(()=>tools.execute('compor_editar_briefing',{...args,value:'sk-sensitive-value'}),/invalid_action/);
 await assert.rejects(()=>tools.execute('compor_editar_briefing',{...args,apiKey:'secret'}),/invalid_action/);assert.equal(calls,0);
});
test('escrita durável exige confirmação fora dos argumentos do modelo',async()=>{
 let writes=0;const tools=createStudioTools({getScope:()=>({userId,projectId,revision:1}),confirm:async()=>false,handlers:{compor_salvar_versao:async()=>{writes++;return {status:'completed'};}}});
 assert.equal((await tools.execute('compor_salvar_versao',{projectId,revision:1,requestId})).status,'declined');assert.equal(writes,0);
});
test('falha após efeito mantém recibo incerto e não reexecuta na mesma chamada',async()=>{
 let writes=0;const tools=createStudioTools({getScope:()=>({userId,projectId,revision:1}),handlers:{compor_editar_briefing:async()=>{writes++;throw Error('interrompido');}}});
 await assert.rejects(()=>tools.execute('compor_editar_briefing',args));assert.equal((await tools.execute('compor_editar_briefing',args)).status,'unknown');assert.equal(writes,1);
});
test('aprovação não permite executar no projeto que ficou inativo',async()=>{
 let scope={userId,projectId,revision:1},calls=0;
 const tools=createStudioTools({getScope:()=>scope,confirm:async()=>{scope={...scope,revision:2};return true;},handlers:{compor_salvar_versao:async()=>{calls++;return {status:'completed'};}}});
 await assert.rejects(()=>tools.execute('compor_salvar_versao',{projectId,revision:1,requestId}),/context_changed/);assert.equal(calls,0);
});
