import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSupabaseActor, ownsSupabaseProject } from '../lib/agent-auth.mjs';
const user = '63de811f-c75c-4571-968c-38a8b3f0accd';
const project = '0a3be452-5152-41d1-a3e8-fc2be56d67e1';

test('valida no Supabase o token da sessão antes de identificar a pessoa', async () => {
  let verified;
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'fake-token' } } }), getUser: async token => { verified = token; return { data: { user: { id: user } } }; } } };
  assert.deepEqual(await resolveSupabaseActor(client), { userId: user, token: 'fake-token' });
  assert.equal(verified, 'fake-token');
  client.auth.getUser = async () => ({ error: { status: 401 } });
  assert.equal(await resolveSupabaseActor(client), null);
});

test('busca projeto sob o token da pessoa e exige id e proprietário correspondentes', async () => {
  let query;
  const args = { config: { service: 'https://example.supabase.co', key: 'sb_publishable_test' }, actor: { userId: user, token: 'fake-token' }, projectId: project,
    fetch: async (url, options) => { query = { url, options }; return Response.json([{ id: project, owner_id: user }]); } };
  assert.equal(await ownsSupabaseProject(args), true);
  assert.equal(query.options.headers.authorization, 'Bearer fake-token');
  assert.equal(query.url.searchParams.get('id'), `eq.${project}`);
  assert.equal(query.url.searchParams.get('owner_id'), `eq.${user}`);
  args.fetch = async () => Response.json([{ id: project, owner_id: 'other' }]);
  assert.equal(await ownsSupabaseProject(args), false);
});
