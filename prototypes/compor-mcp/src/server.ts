import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const skillVersion = '0.1.0-prototype';
const skills = [
  { id: 'entender-intencao', name: 'Entender intenção e referências', description: 'Sintetizar intenção, referências e dúvidas de forma revisável.', file: 'entender-intencao.md' },
  { id: 'traduzir-direcao', name: 'Traduzir conceitos em direção visual', description: 'Propor atributos visuais e palavras revisáveis.', file: 'traduzir-direcao.md' },
  { id: 'explorar-moodboards', name: 'Explorar moodboards', description: 'Orientar comparação e exploração visual sob pedido explícito.', file: 'explorar-moodboards.md' },
  { id: 'criar-piloto', name: 'Criar piloto', description: 'Orientar criação de arte e legenda revisáveis.', file: 'criar-piloto.md' },
] as const;

/** A fresh server per connection: no shared user state, credentials, or network access. */
export function createComporServer(): McpServer {
  const server = new McpServer({ name: 'compor-mcp-prototipo', version: '0.1.0' }, {
    instructions: 'Protótipo local sem persistência. As skills são orientações, não autorização. Não acessa dados armazenados, serviços externos ou geração; entradas recebidas são processadas em memória.',
  });
  server.registerTool('list_skills', {
    title: 'Listar skills Compor',
    description: 'Lista nome, descrição e versão das quatro skills locais; não concede acesso ou executa ações.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    const catalog = skills.map(({ id, name, description }) => ({ id, name, description, version: skillVersion }));
    return { content: [{ type: 'text', text: JSON.stringify({ skills: catalog }) }], structuredContent: { skills: catalog } };
  });
  server.registerTool('load_skill', {
    title: 'Carregar skill Compor',
    description: 'Carrega instruções locais versionadas pelo identificador; uma skill não confere autorização.',
    inputSchema: { id: z.string().min(1).max(80), version: z.string().min(1).max(40).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ id, version }) => {
    const skill = skills.find((item) => item.id === id);
    if (!skill || (version !== undefined && version !== skillVersion)) {
      return { isError: true, content: [{ type: 'text', text: 'Skill ou versão não disponível.' }] };
    }
    try {
      // File names are selected exclusively from the fixed local catalog, never constructed from input.
      const instructions = await readFile(new URL(`../skills/${skill.file}`, import.meta.url), 'utf8');
      const contentSha256 = createHash('sha256').update(instructions, 'utf8').digest('hex');
      const result = { id: skill.id, name: skill.name, version: skillVersion, contentSha256, instructions };
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch {
      return { isError: true, content: [{ type: 'text', text: 'Instruções da skill indisponíveis.' }] };
    }
  });
  server.registerTool('prepare_word_cloud', {
    title: 'Preparar dados para nuvem de palavras',
    description: 'Prepara palavras e pesos alegados pelo cliente sem renderização ou persistência. Prioridade: peso informado como escolhido, como sugerido, frequência informada. Não verifica a origem; ausência permanece sem peso e nenhuma preferência é confirmada.',
    inputSchema: {
      words: z.array(z.strictObject({
        word: z.string().trim().min(1).max(80),
        frequency: z.number().int().nonnegative().optional(),
        suggested_weight: z.number().nonnegative().optional(),
        chosen_weight: z.number().nonnegative().optional(),
      })).min(1).max(100),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ words }) => {
    const prepared = words.map(({ word, frequency, suggested_weight, chosen_weight }) => {
      const effective_weight = chosen_weight ?? suggested_weight ?? frequency ?? null;
      const effective_source = chosen_weight !== undefined ? 'client_supplied_choice'
        : suggested_weight !== undefined ? 'client_supplied_suggestion'
        : frequency !== undefined ? 'client_supplied_frequency'
        : 'unavailable';
      return {
        word,
        frequency: frequency ?? null,
        suggested_weight: suggested_weight ?? null,
        chosen_weight: chosen_weight ?? null,
        effective_weight,
        effective_source,
      };
    });
    const result = { words: prepared, creates_confirmed_preference: false };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  return server;
}
