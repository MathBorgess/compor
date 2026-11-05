import { createSupabaseProjectStore } from '@compor/remote-mcp';
const integer = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
export function createWebProjectStore({ url, anonKey, fetchImpl = fetch }) {
  createSupabaseProjectStore({ url, anonKey, fetchImpl });
  const project = row => {
    if (typeof row?.id !== 'string' || typeof row.title !== 'string' || typeof row.created_at !== 'string' || !integer(row.revision)) throw Error('invalid project');
    return { id: row.id, title: row.title, created_at: row.created_at, revision: row.revision };
  };
  async function request(context, title) {
    const endpoint = new URL('/rest/v1/projects', url);
    endpoint.searchParams.set('select', 'id,owner_id,title,created_at,revision');
    if (title === undefined) endpoint.searchParams.set('owner_id', `eq.${context.actor.userId}`);
    const response = await fetchImpl(endpoint, { method: title === undefined ? 'GET' : 'POST', headers: { apikey: anonKey, authorization: `Bearer ${context.token}`, 'content-type': 'application/json', prefer: 'return=representation' }, ...(title === undefined ? {} : { body: JSON.stringify({ title }) }), redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error('unavailable');
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.some(row => row?.owner_id !== context.actor.userId)) throw Error('invalid response');
    return rows.map(project);
  }
  return {
    list: context => request(context),
    async create(context, title) {
      const rows = await request(context, title);
      if (rows.length !== 1) throw Error('invalid response');
      return rows[0];
    },
    async rename(context, { projectId, title, expectedRevision }) {
      const response = await fetchImpl(new URL('/rest/v1/rpc/rename_project', url), { method: 'POST', headers: { apikey: anonKey, authorization: `Bearer ${context.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_project_id: projectId, p_title: title, p_expected_revision: expectedRevision }), redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw Error('unavailable');
      const result = await response.json();
      if (result?.status === 'not_found') return { status: 'not_found' };
      if (result?.status === 'conflict' && integer(result.currentRevision)) return { status: 'conflict', currentRevision: result.currentRevision };
      if (result?.status !== 'renamed' || result.project?.id !== projectId || result.project.title !== title || result.project.revision !== expectedRevision + 1) throw Error('invalid response');
      return { status: 'renamed', project: project(result.project) };
    },
  };
}
