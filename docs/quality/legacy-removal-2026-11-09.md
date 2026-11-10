# Remoção do caminho legado — 09/11/2026

Escopo: app inteiro, todas as rotas, saída de cliente. Modo fix autorizado por Matheus. Base `93dc7d3`, snapshot `codex-legacy-before-93dc7d3`; export em `/workspace/scratch/compor-legacy-before.jsonl.gz`. Depois isolado: `codex-legacy-after`, export separado. A composição local com as correções #22 e #23 usa `codex-legacy-after-composed` e `/workspace/scratch/compor-legacy-after-composed.jsonl.gz`. Next 16.4.4/Turbopack, Linux, Node 24. Os exports são artefatos locais, fora do Git.

## Evidência do grafo

O importador é `workspace.tsx`, que criava uma fronteira dinâmica para `legacy-workspace.tsx`. A variável de servidor escolhia o ramo. As dependências exclusivas são `projects.tsx`, `pieces.tsx`, `compose.tsx` e `agent-flow.tsx`. O ramo atual continua dinâmico e condicionado à sessão verificada. O alvo é conhecido, então o percurso direto dos importadores explica a remoção sem descoberta de comunidades ou min-cut.

Os módulos exclusivos na base somam 11.965 bytes atribuídos (2.396 + 1.132 + 2.502 + 3.141 + 2.794); `compose-png.ts` soma 850 e só é usado pelo ramo antigo na produção. Esses valores contam uma vez cada contribuição `(filename, source_path)` de cliente, mesmo quando uma rota a repete. Não são o tamanho gzip dos arquivos emitidos.

Na base, as saídas de cliente têm 29 associações exatas e seis `not_a_chunk` (runtime/precompilado). Não houve saída com associação `unsupported` nem grupo com trigger ausente. Os três bootstraps de cliente são `/`, `/_not-found` e `/_global-error`; as referências de cliente aninhadas são consideradas junto deles. A análise não comprova a ordem de requisições ou latência de navegador.

## Varredura de dependências de cliente

| Fonte e importador de cliente | Identidade emitida | Rotas | Bytes atribuídos | Decisão e evidência |
| --- | --- | --- | --- | --- |
| `lib/session-state.ts`, importado por `workspace.tsx` | `[project]/apps/web/lib/session-state.ts [app-client] (ecmascript)` | `/` | 318 / 295 | Suprimido: parser público da resposta de sessão; não valida cookies nem contém credenciais |
| `next/dist/server/app-render/async-local-storage.js`, runtime Next | Mesmo caminho, camada `[app-client]` | `/` | 422 | Suprimido: shim do framework, sem configuração de servidor do app |
| `next/dist/server/app-render/work-async-storage-instance.js`, runtime Next | Mesmo caminho, camada `[app-client]` | `/` | 188 | Suprimido: contexto do framework usado pelo runtime de cliente |
| `next/dist/server/app-render/work-async-storage.external.js`, runtime Next | Mesmo caminho, camada `[app-client]` | `/` | 151 | Suprimido: referência do contexto público do framework |
| `@compor/agile-deliberation/src/exploration.js`, importado por `use-exploration-loop.ts` | Caminho no índice com `[app-client]`; contribuição no output composto | `/` | 1.660 | Suprimido: planejador determinístico e prompt público, com validação de entrada; não chama fornecedor nem configura chave |
| `@compor/agile-deliberation/src/readiness.js`, importado por `studio-chat.tsx` | Caminho no índice com `[app-client]`; contribuição no output composto | `/` | 1.004 / 1.003 | Suprimido: hipótese pública de prontidão para a interface, sem autoridade de aprovação |
| `@compor/agents-api/src/image-proposal.mjs`, importado por `studio-chat-tools.mjs` | Caminho no índice com `[app-client]`; contribuição no output composto | `/` | 509 | Suprimido: contrato e parser de proposta de imagem, sem execução ou credencial do provedor |
| `@compor/agents-api/src/studio-chat-tools.mjs`, importado por `studio-tools.ts` e `project-title.ts` | Caminho no índice com `[app-client]`; contribuição no output composto | `/` | 2.545 | Suprimido: definições e validadores públicos de ferramentas; operações duráveis continuam autenticadas no servidor |

Nenhum módulo de configuração Supabase, banco, SDK de provedor ou adaptador exclusivo de servidor do Compor apareceu nas contribuições de cliente. Contratos públicos compartilhados do Compor permanecem intencionalmente no cliente: Não há Server Action importada pelo cliente do app. Não foi identificado vazamento de módulo exclusivo de servidor; nomes de diretório do framework foram conferidos contra seu uso, e não tratados como prova de conteúdo privado. A cobertura dos seis outputs não enumeráveis é uma limitação para conteúdo do runtime. As quatro contribuições compartilhadas abaixo aparecem nas partes atribuídas do cliente, com identidades individuais no índice, mas são atribuídas em outputs compostos e não aparecem como membros individuais dos outputs. Essa é uma limitação do mapeamento individual, não ausência de bytes. A fonte e os importadores foram conferidos para cada contribuição.

## Validação

O build de produção da base mediu 295.959 bytes gzip de JavaScript em `.next/static`, usando `node:zlib.gzipSync` padrão por arquivo, como o gate, sem headers HTTP. Na composição local `0306f62`, com a remoção e as correções #22/#23, o total é 282.874 bytes (13.085 a menos, 17.126 de folga). Essa diferença inclui as três alterações; não é uma atribuição isolada de economia ao legado. A atribuição do analisador caiu de 358.630 para 342.680 no snapshot isolado da remoção, e para 342.884 na composição com as correções. As duas métricas não são intercambiáveis.

`quality:lint`, `quality:typecheck`, `quality:unit`, testes do avaliador, verificação/build do site, build Next e `quality:performance` passaram. Oito regressões focadas de chave, rascunhos, recuperação e entrada passaram, sem skips. A suíte web completa passou com 279/279 testes, sem falhas ou skips, em 345,67 s usando os dois diretórios isolados da suíte paralela. Uma sondagem negativa do runner, executada fora do repositório com a mesma implementação, confirmou exit code 1 diante de um teste que falha.

O Lighthouse 13.6, Chromium 151 e Node 24.19 em Linux mediram cinco navegações sem sessão, isoladas de outros navegadores/builds: TBT 0 ms em todas, LCP mediano 649 ms e CLS 0,008. JavaScript inicial: zero. Não houve autenticação real nem geração. O CI do PR validará seu próprio commit; a medição local não o substitui. Orçamentos e método permanecem iguais.
