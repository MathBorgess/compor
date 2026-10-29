/** Local experiment only. Production/default MCP never imports this module. */
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { z } from 'zod';
import { createComporServer } from '../../../dist/server.js';

const hash = data => createHash('sha256').update(data).digest('hex');
const errorResult = code => ({ isError: true, content: [{ type: 'text', text: JSON.stringify({ status: 'blocked', code }) }] });

export async function createPreviewServer({ contextPath, python, workerPath, contextSha256, workerSha256 }) {
  if (![contextPath, python, workerPath].every(p => typeof p === 'string' && isAbsolute(p)) ||
      ![contextSha256, workerSha256].every(s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s))) {
    throw new Error('Trusted absolute host paths and pinned hashes required');
  }
  async function context() {
    const [raw, worker] = await Promise.all([readFile(contextPath), readFile(workerPath)]);
    if (hash(raw) !== contextSha256 || hash(worker) !== workerSha256) throw new Error('Host context changed');
    const config = JSON.parse(raw.toString('utf8'));
    if (!isAbsolute(config.output_root)) throw new Error('Invalid output root');
    return config;
  }
  await context();
  const server = createComporServer({ guidance: 'focused_v2' });
  // Budget consumption and evidence writes are explicit effects of this tool.
  server.registerTool('preview_creative', {
    title: 'Compor preview local de teste',
    description: 'Compõe um snapshot com ativos autorizados pelo host. Devolve pixels reais e diagnóstico de encaixe, sem corrigir layout ou texto. Limite de duas tentativas por artefato D1/D2/V1/V2/R1; falhas também consomem tentativa. Observe hierarquia e legibilidade no preview quando disponível. R1 só admite edição dentro do alcance fixado pelo host. Não gera imagens, publica ou salva memória.',
    inputSchema: z.strictObject({ slot: z.enum(['D1', 'D2', 'V1', 'V2', 'R1']), piece: z.record(z.string(), z.unknown()) }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async request => {
    const input = JSON.stringify(request);
    if (Buffer.byteLength(input) > 256_000) return errorResult('input_budget');
    try {
      const config = await context();
      // execFile does not support stdin input: own the child and write exactly
      // one serialized request, without invoking a shell or model-provided code.
      const child = execFile(python, [workerPath, '--context', contextPath],
        { timeout: 30_000, maxBuffer: 8_000_000, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1' } }, () => {});
      let stdout = '';
      const result = await new Promise((accept, reject) => {
        child.stdout.on('data', data => { stdout += data; });
        child.on('error', reject);
        child.on('close', code => code === 0 ? accept(stdout) : reject(new Error('Worker failed')));
        child.stdin.on('error', reject);
        child.stdin.end(input);
      });
      const response = JSON.parse(result);
      const { preview_path: previewPath, ...diagnostic } = response;
      const content = [{ type: 'text', text: JSON.stringify(diagnostic) }];
      if (response.status === 'rendered') {
        const [root, png] = await Promise.all([realpath(config.output_root), realpath(previewPath)]);
        const rel = relative(root, png);
        if (rel.startsWith('..') || isAbsolute(rel) || !rel) throw new Error('Preview outside evidence root');
        const bytes = await readFile(png);
        if (hash(bytes) !== diagnostic.diagnostic?.png_sha256) throw new Error('Preview hash mismatch');
        if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid preview');
        content.push({ type: 'image', mimeType: 'image/png', data: bytes.toString('base64') });
      }
      return { content, structuredContent: diagnostic, ...(response.status === 'rendered' ? {} : { isError: true }) };
    } catch {
      // Never send worker stderr, host paths or configuration values to the model.
      return errorResult('preview_worker_unavailable');
    }
  });
  return server;
}
