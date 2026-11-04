import test from 'node:test';
import assert from 'node:assert/strict';
import {createUsageStore} from '../src/usage-store.mjs';

const actor={userId:'11111111-1111-4111-8111-111111111111',token:'private-user-token'};
const projectId='22222222-2222-4222-8222-222222222222',attemptId='33333333-3333-4333-8333-333333333333',partId='44444444-4444-4444-8444-444444444444';
test('medição registra contagens disponíveis, custo desconhecido e nenhum conteúdo',async()=>{
 const requests=[];
 const store=createUsageStore({url:'https://project.supabase.co',anonKey:'sb_publishable_test',fetch:async(url,init)=>{requests.push({path:url.pathname,...init});return Response.json(true);}});
 assert.equal(await store.start({actor,projectId,attemptId,part:'image',partId}),true);
 await store.finish({actor,projectId,attemptId,part:'image',partId,state:'completed',usage:{input_tokens:10,output_tokens:20,total_tokens:30,prompt:'não deve sair',apiKey:'sk-secret'}});
 const data=JSON.parse(requests[1].body);
 assert.deepEqual(data,{p_project_id:projectId,p_attempt_id:attemptId,p_part:'image',p_part_id:partId,p_state:'completed',p_input_tokens:10,p_output_tokens:20,p_total_tokens:30});
 assert.doesNotMatch(requests[1].body,/não deve sair|sk-secret|private-user-token/);
 assert.equal(requests[1].headers.authorization,'Bearer private-user-token');
});
