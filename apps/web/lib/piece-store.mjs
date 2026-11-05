import { createSupabasePieceStore } from '@compor/remote-mcp';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
function validMetadata(value, version) {
  if (!value || Object.keys(value).sort().join(',') !== 'approval,baseVersion,revision' || !integer(value.revision) || !(value.baseVersion === null || integer(value.baseVersion) && value.baseVersion > 0 && value.baseVersion < version)) return false;
  const a = value.approval;
  if (!a || Object.keys(a).sort().join(',') !== 'at,kind,sourceVersion,status') return false;
  if (a.status === 'unapproved') return a.kind === null && a.sourceVersion === null && a.at === null;
  return a.status === 'approved' && ['explicit', 'inherited'].includes(a.kind) && integer(a.sourceVersion) && a.sourceVersion > 0 &&
    (a.kind === 'explicit' ? a.sourceVersion === version : a.sourceVersion < version) && typeof a.at === 'string' && Number.isFinite(Date.parse(a.at));
}
function versionRow(row, projectId, pieceId) {
  const content = row?.content;
  if (row?.project_id !== projectId || !uuid(row.piece_id) || pieceId && row.piece_id !== pieceId || !integer(row.version) || row.version < 1 || typeof row.created_at !== 'string' ||
    !content || Object.keys(content).sort().join(',') !== 'caption,captionOrigin,date,headline,price' || !['headline', 'price', 'date', 'caption'].every(k => typeof content[k] === 'string' && content[k].length <= (k === 'caption' ? 4000 : k === 'headline' ? 500 : 100)) ||
    !['user', 'agent'].includes(content.captionOrigin) || !validMetadata(row.metadata, row.version)) throw Error('invalid response');
  // PostgREST timestamps may use an offset and microseconds. Browser state uses
  // canonical ISO milliseconds so an already-persisted approval remains readable.
  const metadata={...row.metadata,approval:{...row.metadata.approval,at:row.metadata.approval.at===null?null:new Date(row.metadata.approval.at).toISOString()}};
  return { project_id: row.project_id, piece_id: row.piece_id, version: row.version, content, created_at: row.created_at, metadata };
}
export function createProjectPieceStore({ url, anonKey, fetchImpl = fetch }) {
  const upstream = createSupabasePieceStore({ url, anonKey, fetchImpl });
  async function rpc(name, context, body) {
    const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, url), { method: 'POST', headers: { apikey: anonKey, authorization: `Bearer ${context.token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error('unavailable');
    return response.json();
  }
  function mutation(result, projectId, pieceId, status) {
    if (result?.status === 'not_found') return { status: 'not_found' };
    if (result?.status === 'conflict') {
      const key = status === 'saved' ? 'currentVersion' : 'currentRevision';
      if (!integer(result[key])) throw Error('invalid response');
      return { status: 'conflict', [key]: result[key] };
    }
    if (result?.status !== status) throw Error('invalid response');
    return { status, version: versionRow(result.version, projectId, pieceId) };
  }
  return {
    async save(context, input) {
      if (input.baseVersion === undefined) return upstream.save(context, input);
      const { projectId, pieceId, expectedVersion, baseVersion, content } = input;
      const result = mutation(await rpc('save_piece_version_v2', context, { p_project_id: projectId, p_piece_id: pieceId, p_expected_version: expectedVersion, p_base_version: baseVersion, p_content: content }), projectId, pieceId, 'saved');
      if (result.status === 'saved' && (result.version.version !== expectedVersion + 1 || result.version.metadata.baseVersion !== (baseVersion || null))) throw Error('invalid response');
      return result;
    },
    async approve(context, { projectId, pieceId, version, expectedRevision }) {
      const result = mutation(await rpc('approve_piece_version', context, { p_project_id: projectId, p_piece_id: pieceId, p_version: version, p_expected_revision: expectedRevision }), projectId, pieceId, 'approved');
      if (result.status === 'approved' && (result.version.version !== version || result.version.metadata.revision !== expectedRevision + 1 || result.version.metadata.approval.kind !== 'explicit')) throw Error('invalid response');
      return result;
    },
    async listProject(context, projectId) {
      const rows = await rpc('list_project_piece_versions_v2', context, { p_project_id: projectId });
      if (!Array.isArray(rows) || rows.length > 1000) throw Error('invalid or incomplete response');
      return rows.map(row => versionRow(row, projectId));
    },
  };
}
