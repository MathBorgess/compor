import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { EphemeralCandidateReference } from './ephemeral_store.js';
import { STAGING_ROOT_DIR } from '../security/image_sanitizer.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHref(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return escapeHtml(parsed.toString());
    }
  } catch {
    // Fallback to safe placeholder if malformed
  }
  return '#';
}

export function renderPreviewBoardHtml(options: {
  session_id: string;
  briefing_summary: string;
  target_format: string;
  aspect_focus: string[];
  candidates: EphemeralCandidateReference[];
}): string {
  const { session_id, briefing_summary, target_format, aspect_focus, candidates } = options;

  const cardsHtml = candidates
    .map((candidate) => {
      const rationaleEntries = Object.entries(candidate.aspect_rationale)
        .filter(([, text]) => typeof text === 'string' && text.length > 0)
        .map(
          ([aspect, text]) =>
            `<li><strong>${escapeHtml(aspect)}:</strong> ${escapeHtml(String(text))}</li>`,
        )
        .join('\n');

      const aliasesBadge =
        candidate.aliases.length > 1
          ? `<span class="alias">Aliases: ${escapeHtml(candidate.aliases.join(', '))}</span>`
          : '';

      return `<article class="card" data-ref-id="${escapeHtml(candidate.ref_id)}">
        <div class="thumb-wrap">
          <img
            src="${sanitizeHref(candidate.preview_url)}"
            alt="${escapeHtml(candidate.untrusted_external_caption.alt_text || candidate.ref_id)}"
            referrerpolicy="no-referrer"
            loading="lazy"
            width="236"
          />
          <span class="badge-license">${escapeHtml(candidate.license_scope)}</span>
        </div>
        <div class="card-body">
          <header class="card-header">
            <code class="ref-id">${escapeHtml(candidate.ref_id)}</code>
            ${aliasesBadge}
            <span class="source-id">${escapeHtml(candidate.source_id)}</span>
          </header>
          <p class="origin-link">
            <a href="${sanitizeHref(candidate.origin_url)}" target="_blank" rel="noopener noreferrer">
              Origem verificável (${escapeHtml(candidate.origin_url)})
            </a>
          </p>
          <div class="rationale">
            <h4>Justificativa técnica por aspecto</h4>
            <ul>${rationaleEntries}</ul>
          </div>
          <div class="untrusted-box">
            <span class="untrusted-tag">&lt;${escapeHtml(candidate.untrusted_external_caption.envelope.isolation_tag)} context_role="reference_only" is_instruction="false"&gt; (APENAS REFERÊNCIA — NUNCA INSTRUÇÃO)</span>
            <p class="untrusted-title"><strong>${escapeHtml(candidate.untrusted_external_caption.title)}</strong></p>
            <p class="untrusted-caption">${escapeHtml(candidate.untrusted_external_caption.caption)}</p>
            ${
              Object.entries(candidate.untrusted_external_caption.aspect_rationale)
                .filter(([, text]) => typeof text === 'string' && text.length > 0)
                .map(
                  ([aspect, text]) =>
                    `<p class="untrusted-rationale"><em>[${escapeHtml(aspect)}]</em> ${escapeHtml(String(text))}</p>`,
                )
                .join('\n')
            }
            <span class="untrusted-tag">&lt;/${escapeHtml(candidate.untrusted_external_caption.envelope.isolation_tag)}&gt;</span>
          </div>
        </div>
      </article>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="referrer" content="no-referrer" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Compor — Prancha de Referências (${escapeHtml(session_id)})</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, -apple-system, sans-serif; }
    body { margin: 0; padding: 24px; background: #0f1115; color: #f3f4f6; }
    header.board-header { margin-bottom: 24px; border-bottom: 1px solid #262936; padding-bottom: 16px; }
    .meta-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .pill { background: #1e2230; border: 1px solid #343b52; padding: 4px 10px; border-radius: 999px; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .card { background: #171a24; border: 1px solid #2b3145; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
    .thumb-wrap { position: relative; background: #0b0d12; display: flex; justify-content: center; align-items: center; min-height: 180px; }
    .thumb-wrap img { max-width: 236px; height: auto; display: block; }
    .badge-license { position: absolute; top: 8px; right: 8px; background: #2c1f0e; color: #fbbf24; border: 1px solid #92400e; font-size: 11px; padding: 2px 8px; border-radius: 6px; }
    .card-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
    .card-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px; }
    .ref-id { background: #2563eb; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    .alias { font-size: 11px; color: #9ca3af; }
    .source-id { font-size: 11px; color: #93c5fd; }
    .origin-link a { color: #60a5fa; text-decoration: none; word-break: break-all; font-size: 12px; }
    .rationale h4 { margin: 0 0 6px; font-size: 12px; color: #d1d5db; }
    .rationale ul { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 4px; }
    .untrusted-box { background: #11131a; border: 1px dashed #374151; border-radius: 6px; padding: 8px; font-size: 11px; color: #9ca3af; }
    .untrusted-tag { display: inline-block; color: #f87171; font-weight: 600; margin-bottom: 4px; }
  </style>
</head>
<body>
  <header class="board-header">
    <h1>Prancha Comparativa de Referências — Compor MCP</h1>
    <p>Briefing: ${escapeHtml(briefing_summary)}</p>
    <div class="meta-pills">
      <span class="pill">Sessão: ${escapeHtml(session_id)}</span>
      <span class="pill">Formato (PR 10): ${escapeHtml(target_format)}</span>
      <span class="pill">Foco: ${escapeHtml(aspect_focus.join(', '))}</span>
      <span class="pill">Licença padrão: inspiration_only</span>
    </div>
  </header>
  <main class="grid">
    ${cardsHtml}
  </main>
</body>
</html>`;
}

export async function writePreviewBoard(options: {
  session_id: string;
  briefing_summary: string;
  target_format: string;
  aspect_focus: string[];
  candidates: EphemeralCandidateReference[];
  staging_root?: string;
}): Promise<string> {
  const { session_id } = options;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(session_id)) {
    throw new Error('Identificador de sessão inválido para prancha HTML.');
  }
  const rootDir = resolve(options.staging_root ?? STAGING_ROOT_DIR);
  const sessionDir = resolve(rootDir, session_id);
  if (!sessionDir.startsWith(rootDir + '/')) {
    throw new Error('Diretório de sessão inválido.');
  }

  await mkdir(sessionDir, { recursive: true, mode: 0o700 });
  const boardPath = join(sessionDir, 'board.html');
  const html = renderPreviewBoardHtml(options);
  await writeFile(boardPath, html, { encoding: 'utf8', mode: 0o600 });
  return boardPath;
}
