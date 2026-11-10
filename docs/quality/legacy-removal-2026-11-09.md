# Remoção do caminho legado — 09/11/2026

Escopo: app inteiro, todas as rotas, saída de cliente. Modo fix autorizado por Matheus. Base `93dc7d3`, snapshot `codex-legacy-before-93dc7d3`; export em `/workspace/scratch/compor-legacy-before.jsonl.gz`. Depois: `codex-legacy-after`, export separado. Next 16.4.4/Turbopack, Linux, Node 24. Os exports são artefatos locais, fora do Git.

## Evidência do grafo

O importador é `workspace.tsx`, que criava uma fronteira dinâmica para `legacy-workspace.tsx`. A variável de servidor escolhia o ramo. As dependências exclusivas são `projects.tsx`, `pieces.tsx`, `compose.tsx` e `agent-flow.tsx`. O ramo atual continua dinâmico e condicionado à sessão verificada. O alvo é conhecido, então o percurso direto dos importadores explica a remoção sem descoberta de comunidades ou min-cut.

Os módulos exclusivos na base somam 11.965 bytes atribuídos (2.396 + 1.132 + 2.502 + 3.141 + 2.794); `compose-png.ts` soma 850 e só é usado pelo ramo antigo na produção. Esses valores contam uma vez cada contribuição `(filename, source_path)` de cliente, mesmo quando uma rota a repete. Não são o tamanho gzip dos arquivos emitidos.

Na base, as saídas de cliente têm 29 associações exatas e seis `not_a_chunk` (runtime/precompilado). Não houve saída com associação `unsupported` nem grupo com trigger ausente. Os três bootstraps de cliente são `/`, `/_not-found` e `/_global-error`; as referências de cliente aninhadas são consideradas junto deles. A análise não comprova a ordem de requisições ou latência de navegador.

## Varredura de dependências de cliente

| Fonte e importador de cliente | Identidade emitida | Rotas | Bytes atribuídos | Decisão e evidência |
| --- | --- | --- | --- | --- |
| `lib/session-state.ts`, importado por `workspace.tsx` | `[project]/apps/web/lib/session-state.ts [app-client] (ecmascript)` | `/` | 318 | Suprimido: parser público da resposta de sessão; não valida cookies nem contém credenciais |
| `next/dist/server/app-render/async-local-storage.js`, runtime Next | Mesmo caminho, camada `[app-client]` | `/` | 422 | Suprimido: shim do framework, sem configuração de servidor do app |
| `next/dist/server/app-render/work-async-storage-instance.js`, runtime Next | Mesmo caminho, camada `[app-client]` | `/` | 188 | Suprimido: contexto do framework usado pelo runtime de cliente |
| `next/dist/server/app-render/work-async-storage.external.js`, runtime Next | Mesmo caminho, camada `[app-client]` | `/` | 151 | Suprimido: referência do contexto público do framework |

Nenhum módulo de configuração Supabase, banco, SDK de provedor ou pacote servidor do Compor apareceu nos membros emitidos do cliente. Não há Server Action importada pelo cliente do app. Não foi identificado vazamento de módulo exclusivo de servidor; nomes de diretório do framework foram conferidos contra seu uso, e não tratados como prova de conteúdo privado. A cobertura dos seis outputs não enumeráveis é uma limitação para conteúdo do runtime; não há alvo do Compor sem associação conhecida.

## Validação

O build de produção da base mediu 295.959 bytes gzip de JavaScript em `.next/static`, usando `node:zlib.gzipSync` padrão por arquivo, como o gate, sem headers HTTP. A economia depois da remoção e os resultados dos checks serão registrados após a verificação. Os orçamentos e o método de medição permanecem iguais.
