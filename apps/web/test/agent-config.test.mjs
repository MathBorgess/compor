import test from 'node:test';
import assert from 'node:assert/strict';
import {agentSigningKey} from '../lib/agent-config.ts';
test('geração depende de habilitação explícita e chave HMAC segura e canônica',()=>{
 const secret=Buffer.alloc(32,9).toString('base64url');
 assert.equal(agentSigningKey({}),null);assert.equal(agentSigningKey({COMPOR_AGENT_ENABLED:'true'}),null);assert.equal(agentSigningKey({COMPOR_AGENT_ENABLED:'true',COMPOR_AGENT_HMAC_SECRET:'abc'}),null);assert.equal(agentSigningKey({COMPOR_AGENT_ENABLED:'false',COMPOR_AGENT_HMAC_SECRET:secret}),null);
 assert.equal(agentSigningKey({COMPOR_AGENT_ENABLED:'true',COMPOR_AGENT_HMAC_SECRET:secret}).length,32);
});
