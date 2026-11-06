import test from 'node:test';
import assert from 'node:assert/strict';
import { localDevelopmentAuth } from '../lib/local-auth.ts';

test('login local é habilitado apenas em desenvolvimento, com flag e duas origens loopback explícitas', () => {
  const config={app:'http://127.0.0.1:3000',service:'https://127.0.0.1:54331',key:'sb_publishable_test'};
  const env={NODE_ENV:'development',COMPOR_LOCAL_AUTH_ENABLED:'true'};
  assert.equal(localDevelopmentAuth(config,env),true);
  assert.equal(localDevelopmentAuth(config,{...env,NODE_ENV:'production'}),false);
  assert.equal(localDevelopmentAuth(config,{...env,COMPOR_LOCAL_AUTH_ENABLED:'false'}),false);
  assert.equal(localDevelopmentAuth({...config,service:'https://example.supabase.co'},env),false);
  assert.equal(localDevelopmentAuth({...config,app:'http://localhost:3000'},env),false);
  assert.equal(localDevelopmentAuth({...config,service:'http://127.0.0.1:54331'},env),false);
  assert.equal(localDevelopmentAuth({...config,service:'https://127.0.0.1.evil.example:54331'},env),false);
});
