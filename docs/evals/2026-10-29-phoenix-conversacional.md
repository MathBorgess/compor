# Phoenix conversacional — verificação pontual

Em 29/10/2026, no macOS Darwin arm64, Node.js v24.16.0 e Codex CLI 0.162.1, a revisão local baseada em `aa84849` foi exercitada via MCP em memória, sem servidor HTML e sem Supabase. O briefing foi fictício: “Peça editorial fictícia para curso de criatividade”.

A busca usou o provedor HTTP curado do Pinterest, limitada por um adaptador de teste a um resultado por board. O roteamento e a ordenação usaram o subprocesso isolado do Codex com modelo `gpt-6-luna`; a saída do MCP identificou o motor como `codex_luna_subagent`. Uma chamada retornou três candidatos reais do provedor e três blocos de imagem MCP, em 22.254 ms. A chamada autorizou explicitamente busca externa e uso do modelo; nenhuma origem ou parâmetro de rastreamento foi registrado neste documento.

Antes dessa chamada, um ensaio com provedor simulado falhou porque a resposta do roteador omitiu o campo obrigatório `rationale`. O prompt foi corrigido para listar os campos obrigatórios, e o ensaio com provedor simulado foi repetido com sucesso (três candidatos). O caso real foi feito em seguida. Os testes automatizados usam dados e provedores controlados; não substituem essa chamada de rede pontual.

Para reproduzir, dentro de `prototypes/compor-mcp` após `npm run build`, execute o script abaixo em um ambiente que tenha autenticação Codex e suporte ao modelo. O programa envia o briefing fictício ao modelo e aos boards; a busca é autorizada pelos argumentos da chamada. Resultados, disponibilidade e duração podem variar.

```sh
node --input-type=module <<'JS'
import { createComporServer } from './dist/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CuratedPinterestProvider } from './dist/providers/curated_pinterest.js';

const real = new CuratedPinterestProvider();
const bounded = { async searchMetadataOnly(args) {
  return (await real.searchMetadataOnly({ ...args, limit: 1 })).slice(0, 1);
} };
const server = createComporServer({ providers: new Map([['pinterest_curated_design', bounded]]) });
const client = new Client({ name: 'phoenix-luna-real-smoke', version: '1' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
await client.connect(clientTransport);
try {
  const started = Date.now();
  const result = await client.callTool({ name: 'discover_visual_references', arguments: {
    briefing: 'Peça editorial fictícia para curso de criatividade',
    target_format: 'carousel_editorial_4:5',
    decision_fallback_mode: 'luna_subagent',
    consent_external_search: true,
    consent_model: true,
    client_mode: 'codex',
  } });
  console.log(JSON.stringify({
    error: result.isError ?? false,
    engine: result.structuredContent?.decision_engine_source ?? null,
    candidates: result.structuredContent?.top_candidates?.length ?? 0,
    images: result.content?.filter(block => block.type === 'image').length ?? 0,
    elapsed_ms: Date.now() - started,
    message: result.isError ? result.content?.[0]?.text : undefined,
  }));
} finally {
  await client.close();
  await server.close();
}
JS
```

Essa observação verifica uma execução local de busca e ordenação, não prova qualidade criativa, licença de reutilização, implantação, segurança multiusuário, treinamento, eficiência de cache ou custo. A duração de uma única chamada não é benchmark. O uso da Decision API não foi testado nessa execução.
