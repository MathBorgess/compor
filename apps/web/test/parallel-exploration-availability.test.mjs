import test from 'node:test';
import assert from 'node:assert/strict';
import {parallelExplorationAvailable} from '../lib/parallel-exploration-availability.ts';

test('capacidade paralela exige flag explícita e configuração de servidor completa',()=>{
 const env={COMPOR_PARALLEL_EXPLORATION_ENABLED:'true',COMPOR_PRIVATE_IMAGES_ENABLED:'true',COMPOR_AGENT_ENABLED:'true',COMPOR_AGENT_HMAC_SECRET:Buffer.alloc(32,42).toString('base64url')};
 assert.equal(parallelExplorationAvailable(true,{}),false);
 assert.equal(parallelExplorationAvailable(false,env),false);
 for(const name of Object.keys(env))assert.equal(parallelExplorationAvailable(true,{...env,[name]:undefined}),false,name+' é obrigatório');
 assert.equal(parallelExplorationAvailable(true,{...env,COMPOR_PARALLEL_EXPLORATION_ENABLED:'TRUE'}),false);
 assert.equal(parallelExplorationAvailable(true,{...env,COMPOR_AGENT_HMAC_SECRET:'inválido'}),false);
 assert.equal(parallelExplorationAvailable(true,env),true);
});
