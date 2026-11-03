import { createSupabasePieceStore } from '@compor/remote-mcp';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function createProjectPieceStore({ url, anonKey, fetchImpl = fetch }) {
  const upstream = createSupabasePieceStore({ url, anonKey, fetchImpl });
  return {
    save: upstream.save,
    async listProject(context, projectId) {
      const endpoint = new URL('/rest/v1/piece_versions', url);
      endpoint.searchParams.set('select', 'project_id,piece_id,version,content,created_at,projects!inner(owner_id)');
      endpoint.searchParams.set('project_id', `eq.${projectId}`);
      endpoint.searchParams.set('projects.owner_id', `eq.${context.actor.userId}`);
      endpoint.searchParams.set('order', 'created_at.asc');
      endpoint.searchParams.set('limit', '1001');
      const response = await fetchImpl(endpoint, { headers: { apikey: anonKey, authorization: `Bearer ${context.token}`, prefer: 'count=exact' }, redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('unavailable');
      const rows = await response.json();
      const total = /\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
      if (!Array.isArray(rows) || !total || Number(total[1]) !== rows.length || rows.length > 1000) throw new Error('invalid or incomplete response');
      return rows.map(row => {
        const value = row?.content;
        if (row?.project_id !== projectId || row?.projects?.owner_id !== context.actor.userId || !uuid(row?.piece_id) || !Number.isSafeInteger(row?.version) || row.version < 1 || typeof row.created_at !== 'string' || !value || Object.keys(value).length !== 5 || !['headline', 'price', 'date', 'caption'].every(k => typeof value[k] === 'string') || !['user', 'agent'].includes(value.captionOrigin)) throw new Error('invalid response');
        return { project_id: row.project_id, piece_id: row.piece_id, version: row.version, content: value, created_at: row.created_at };
      });
    },
  };
}
