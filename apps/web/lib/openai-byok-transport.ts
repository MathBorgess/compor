// Older, body-only deployments reject this media type before resolving Vault.
export const byokJsonMediaType='application/vnd.compor.byok+json';

export function byokJsonHeaders(key:string) {
  return {'content-type':byokJsonMediaType,'x-compor-openai-key':key};
}
