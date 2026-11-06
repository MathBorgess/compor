import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentImageRoute} from '../lib/agent-image-route.ts';

const actor={userId:'11111111-1111-4111-8111-111111111111',token:'synthetic-token'};
const projectId='22222222-2222-4222-8222-222222222222',pieceId='33333333-3333-4333-8333-333333333333',attemptId='44444444-4444-4444-8444-444444444444',executionId='55555555-5555-4555-8555-555555555555',assetId='66666666-6666-4666-8666-666666666666';
const headline='Primeira linha\nSegunda linha';
const body={projectId,pieceId,version:3,attemptId,apiKey:'sk-synthetic_abcdefghijklmnopqrstuvwxyz',actionBinding:'synthetic',explicitApproval:true,artworkInput:{literalText:{headline,price:'',date:''},source:null,images:[]}};
const request=value=>new Request('https://compor.test/api/agent/image',{method:'POST',headers:{origin:'https://compor.test','content-type':'application/json'},body:JSON.stringify(value)});

test('rota aceita título multilinha sem alterar texto e ainda rejeita controles inválidos antes de executar',async()=>{
 let approvals=0,executions=0;
 const handler=createAgentImageRoute({appOrigin:'https://compor.test',resolveActor:async()=>actor,
  approve:async input=>{approvals++;assert.equal(input.artworkInput.literalText.headline,headline);return 'proof';},
  execute:async input=>{executions++;assert.equal(input.artworkInput.literalText.headline,headline);return {status:'completed',executionId,toolResult:{output:JSON.stringify({assetId})}};},
  send:async()=>({status:'accepted'}),
 });
 const result=await handler(request(body));assert.equal(result.status,202);assert.deepEqual(await result.json(),{status:'accepted',assetId});
 const invalid={...body,artworkInput:{...body.artworkInput,literalText:{...body.artworkInput.literalText,headline:'A\u0000B'}}};
 assert.equal((await handler(request(invalid))).status,400);assert.equal(approvals,1);assert.equal(executions,1);
});
