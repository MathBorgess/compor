import test from 'node:test';
import assert from 'node:assert/strict';
import {agentSigningKey,agentSessionSpendLimit} from '../lib/agent-config.mjs';
test('geração depende de habilitação explícita e chave HMAC segura e canônica',()=>{
 const secret=Buffer.alloc(32,9).toString('base64url');
 assert.equal(agentSigningKey({}),null);assert.equal(agentSigningKey({COMPOR_AGENT_ENABLED:'true'}),null);assert.equal(agentSigningKey({COMPOR_AGENT_ENABLED:'true',COMPOR_AGENT_HMAC_SECRET:'abc'}),null);assert.equal(agentSigningKey({COMPOR_AGENT_ENABLED:'false',COMPOR_AGENT_HMAC_SECRET:secret}),null);
 assert.equal(agentSigningKey({COMPOR_AGENT_ENABLED:'true',COMPOR_AGENT_HMAC_SECRET:secret}).length,32);
});

test('session spend configuration uses cents, a safe default, and rejects invalid values', () => {
 assert.equal(agentSessionSpendLimit({}),25);
 assert.equal(agentSessionSpendLimit({COMPOR_AGENT_SESSION_SPEND_CENTS:'1'}),1);
 assert.equal(agentSessionSpendLimit({COMPOR_AGENT_SESSION_SPEND_CENTS:'500'}),500);
 for (const value of ['', '0', '501', '-1', '1.5', '1e2', ' 25', '25 ', '01', 'Infinity', 'null']) {
  assert.equal(agentSessionSpendLimit({COMPOR_AGENT_SESSION_SPEND_CENTS:value}),null);
 }
});
