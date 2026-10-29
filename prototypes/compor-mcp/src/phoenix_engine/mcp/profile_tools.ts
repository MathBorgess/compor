import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProfileLedger } from '../services/profile_ledger.js';
import type { SummaryDelivery } from '../services/summary_delivery.js';

const short = z.string().trim().min(1).max(200);
const scope = z.strictObject({ type: z.enum(['session', 'task', 'campaign', 'user']), id: short });
const result = (data: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  structuredContent: data,
});

function describeProfileChange(change: ReturnType<ProfileLedger['record']>['change'], duplicate: boolean): string {
  if (duplicate) return 'Este sinal já havia sido registrado; o perfil não foi alterado novamente.';
  if (!change?.current) return 'Registrei o sinal; nenhuma preferência foi alterada.';
  const current = change.current;
  const previous = change.previous ? `Antes: ${change.previous.value} (${change.previous.confidence}). ` : '';
  const confidence = current.confidence === 'ambiguous' ? 'hipótese ambígua' : 'preferência informada como confirmada';
  return `Atualizei ${current.key} no contexto ${current.scope.type}/${current.scope.id}. ${previous}Agora: ${current.value} (${confidence}), a partir do sinal ${change.event_id}, versão ${current.version_id}. Você pode corrigir ou desfazer esta mudança; o valor anterior será restaurado.`;
}

/** A trusted host binds actor and ledger to a connection. Not a production auth boundary. */
export type ProfileToolSession = { ledger: ProfileLedger; directory?: Promise<string>; persistenceDirectory?: string; syncOwner?: () => Promise<string>; delivery?: SummaryDelivery };
export function registerProfileTools(server: McpServer, actor: string, session: ProfileToolSession) {
  const { ledger } = session;
  const sync = async () => {
    if (session.persistenceDirectory) await ledger.saveLocal(actor, session.persistenceDirectory);
    const path = await ledger.syncMarkdown(actor, await (session.directory ??= mkdtemp(join(tmpdir(), 'compor-phoenix-profile-'))));
    session.syncOwner = sync;
    return path;
  };
  server.registerTool('phoenix_profile_consent', {
    title: 'Autorizar ou revogar finalidade do perfil',
    description: 'Registra ou revoga autorização informada pela pessoa para uma finalidade específica. A autorização de personalização não autoriza avaliação, compartilhamento ou envio ao mantenedor. Use somente quando a pessoa autorizou ou revogou essa finalidade na conversa; não infira consentimento de silêncio.',
    inputSchema: { purpose: z.enum(['personalization', 'evaluation', 'maintainer_summary', 'full_content']), granted: z.boolean() },
  }, async ({ purpose, granted }) => {
    const consent = ledger.setConsent(actor, purpose, granted);
    return result({ consent, markdown_path: await sync() });
  });
  server.registerTool('phoenix_profile_signal', {
    title: 'Registrar sinal e atualizar perfil',
    description: 'Durante a conversa, registre proativamente edição, escolha, rejeição, reação, exportação ou comentário da própria pessoa quando a personalização estiver autorizada. Use a versão e o contexto da peça; preserve a fala original em person_statement e a interpretação do Codex separadamente em agent_interpretation. Informe uma preferência somente quando houver uma interpretação identificável; marque hipótese ou fala ambígua como ambiguous, mesmo que altere valor confirmado. Não trate silêncio, download, mera exposição ou reação sem motivo como aprovação. Avise a pessoa usando message e ofereça desfazer. O Codex interpreta a conversa: esta ferramenta não interpreta textos por conta própria.',
    inputSchema: {
      id: short, kind: z.enum(['edit', 'choice', 'rejection', 'reaction', 'export', 'comment']),
      version_id: short, scope, source: short,
      person_statement: z.string().trim().min(1).max(2000).optional(),
      agent_interpretation: z.string().trim().min(1).max(2000).optional(),
      preference: z.strictObject({ key: short, value: short, confidence: z.enum(['ambiguous', 'confirmed']) }).optional(),
    },
  }, async (signal) => {
    const outcome = ledger.record(actor, signal);
    const markdown_path = await sync();
    const message = describeProfileChange(outcome.change, outcome.duplicate);
    return { content: [{ type: 'text' as const, text: message }], structuredContent: { ...outcome, markdown_path, message } };
  });
  server.registerTool('phoenix_profile_undo', {
    title: 'Desfazer mudança de preferência',
    description: 'Use quando a pessoa corrigir ou desfizer uma mudança de preferência. Restaura o valor anterior e mantém a correção no histórico.',
    inputSchema: { change_id: short, correction: z.string().trim().min(1).max(2000) },
  }, async ({ change_id, correction }) => {
    const change = ledger.undo(actor, change_id, correction);
    const message = change.current
      ? `Desfiz a alteração. ${change.current.key} voltou para ${change.current.value}; registrei a correção.`
      : 'Desfiz a alteração e registrei a correção; não havia valor anterior para restaurar.';
    return { content: [{ type: 'text' as const, text: message }], structuredContent: { change, message, markdown_path: await sync() } };
  });
  server.registerTool('phoenix_profile_read', {
    title: 'Ver perfil e histórico', inputSchema: {},
  }, async () => {
    const profile = ledger.read(actor);
    return result({ profile, markdown_path: await sync() });
  });
  server.registerTool('phoenix_profile_maintainer_consent', {
    title: 'Autorizar destinatário e finalidade do resumo',
    inputSchema: { recipient: short, purpose: short, granted: z.boolean() },
  }, async ({ recipient, purpose, granted }) => {
    ledger.setMaintainerConsent(actor, recipient, purpose, granted);
    return result({ recipient, purpose, granted, markdown_path: await sync() });
  });
  server.registerTool('phoenix_profile_summary', {
    title: 'Preparar resumo local para Supabase',
    description: 'Prepara um snapshot local para destinatário e finalidade autorizados; não envia nem conecta ao Supabase.',
    inputSchema: { recipient: short, purpose: short },
  }, async ({ recipient, purpose }) => result({ summary: ledger.maintainerSummary(actor, recipient, purpose), delivery: 'not_sent', markdown_path: await sync() }));
  server.registerTool('phoenix_profile_send_summary', {
    title: 'Enviar resumo a destino configurado pelo host',
    description: 'Só funciona com porta e verificador de minimização configurados pelo host e autorização vigente para destinatário e finalidade.',
    inputSchema: { recipient: short, purpose: short },
  }, async ({ recipient, purpose }) => {
    if (!session.delivery) throw new Error('Envio não configurado pelo host.');
    const attempt = await session.delivery.send(actor, recipient, purpose);
    return result({ attempt, markdown_path: await sync() });
  });
  server.registerTool('phoenix_profile_share', {
    title: 'Autorizar ou revogar colaboração para estudo',
    description: 'Registra colaborador e finalidade; o host deve vincular identidade confiável antes de liberar leitura.',
    inputSchema: { collaborator: short, purpose: short, granted: z.boolean() },
  }, async ({ collaborator, purpose, granted }) => {
    if (granted) ledger.share(actor, collaborator, purpose); else ledger.revokeShare(actor, collaborator, purpose);
    return result({ collaborator, purpose, granted, markdown_path: await sync() });
  });
  server.registerTool('phoenix_profile_read_shared', {
    title: 'Ler perfil compartilhado para uma finalidade autorizada',
    description: 'A identidade do colaborador é fornecida pelo host, nunca pelo argumento da ferramenta.',
    inputSchema: { purpose: short },
  }, async ({ purpose }) => {
    const profile = ledger.readShared(actor, purpose);
    if (session.syncOwner) await session.syncOwner();
    return result({ profile });
  });
}
