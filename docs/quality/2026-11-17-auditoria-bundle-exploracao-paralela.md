# Auditoria do bundle da exploração paralela

- Data: 17/11/2026. Base: `547d2fa0ea22b1bdf33c40930651efc8e4e28689`.
- Escopo: build de produção do app web e todos os arquivos JavaScript de cliente cobertos por `quality:performance`; o exame detalhado das contribuições do analisador foi feito na rota `/`. Modo: investigação de redução, sem alteração de produto ou orçamento.
- Ambiente: macOS arm64, Node `v24.16.0`, Next `16.4.6`, React `19.3.1`, Zod `4.6.7` e `markdown-to-jsx` `7.7.17`. Não houve chamada a modelo nem geração de imagem.

## Resultado do gate e medições

O relatório local de `quality:performance` da integração, para a base acima, registrou `totalClientJavascriptGzipBytes=321760` perante o limite de `300000`: excedente de **21.760 bytes**. O comando soma o gzip de cada arquivo `.js` de `.next/static`, inclusive chunks assíncronos; não é a soma dos arquivos necessariamente carregados em uma navegação. A bancada isolada compilou a mesma base e reproduziu os 321.760 bytes com `gzipSync` em cada arquivo. O relatório de performance usou entrada sem sessão e configuração pública sintética; os resultados não demonstram uso autenticado, transferência real ou latência de geração.

O snapshot completo do analisador `parallel-budget-before-547d2fa`, exportado para `/tmp/compor-budget-before-547d2fa.jsonl.gz`, selecionou 48 rotas. Na rota `/`, a soma de contribuições atribuídas aos arquivos `[client-fs]`, com cada par arquivo/caminho de origem contado uma vez, foi de **407.895 bytes comprimidos atribuídos**. O valor inclui CSS e saídas assíncronas; gzip por contribuição não equivale ao gzip dos arquivos completos do gate. Não se deve somar ou comparar diretamente as duas métricas.

Para reproduzir o snapshot em `apps/web`:

```sh
set -o pipefail
npx --no-install next analyze --output --snapshot 'parallel-budget-before-547d2fa'
npx --no-install next analyze export --snapshot 'parallel-budget-before-547d2fa' | gzip > /tmp/compor-budget-before-547d2fa.jsonl.gz
```

Os arquivos em `/tmp` são evidência local temporária, não artefatos versionados. O relatório do gate foi lido em `quality-results/performance/summary.json` da worktree de integração; seu registro é datado de `2026-11-17T13:19:06.364Z`, com cinco execuções Lighthouse. A verificação isolada não repetiu o Lighthouse.

## Contribuições e candidatos examinados

As cifras abaixo são atribuições comprimidas do analisador para `/`, e não estimativas de tráfego nem economias garantidas.

| Origem ou módulo | Bytes atribuídos | Evidência e limite |
| --- | ---: | --- |
| Next e runtime incluídos em `next` | 208.474 | Inclui React DOM compilado e o polyfill; não se identificou uma substituição segura de 21.760 bytes. |
| Zod | 23.875 | Uma única versão instalada; `apps/web/lib/schema.ts` já usa `zod/mini`. Migrar os schemas exigiria revalidar contratos em dezenas de arquivos; não foi estimado um ganho demonstrado. |
| `markdown-to-jsx` | 6.379 | Importado por `studio-chat.tsx`; remover ou trocar o renderizador exige preservar a semântica e o tratamento do conteúdo. Isoladamente não cobre o excedente. |
| `@compor/agents-api` | 3.921 | Inclui contratos de ferramentas, proposta e plano usados pelo cliente. |
| `@compor/agile-deliberation` | 3.113 | Inclui contratos e lógica de exploração compartilhada. |
| `@swc/helpers` | 412 | Helpers do código compilado. |
| `parallel-exploration-journal.ts` | 4.399 | Persistência local, validação e reconciliação dos recibos. |
| `use-parallel-exploration.ts` | 3.309 | Coordenação dos gates e do ciclo do lote. |
| `parallel-exploration-recovery.tsx` | 3.081 | Recuperação explícita e reposição. |
| `parallel-exploration-client.ts` / `parallel-exploration-dispatch.ts` | 1.867 / 1.707 | Leitura validada e despacho com intenção. |
| `parallel-exploration-replacement-run.ts` | 1.371 | Reposição e preservação do resultado incerto. |
| `exploration-plan-contract.mjs` | 1.226 | Contrato compartilhado de plano e fatos. |

O polyfill `next/dist/build/polyfills/polyfill-nomodule.js` representa 39.434 bytes atribuídos. O arquivo de saída correspondente no build mediu 39.473 bytes gzip. Sua remoção ou substituição poderia mudar suporte a navegadores; não foi proposta nem realizada. O analisador indicou a saída como `not_a_chunk`, portanto não fornece associação exata de todos os seus módulos.

`workspace.tsx` importa `studio-app.tsx` dinamicamente; o estúdio importa o hook paralelo e carrega a recuperação por `next/dynamic`. Essas fronteiras explicam partes assíncronas no grafo, mas tornar mais código assíncrono, por si só, não reduziria um gate que soma todos os arquivos emitidos. Não foi identificada duplicação do mesmo caminho de origem entre arquivos de cliente na exportação examinada; isso não prova ausência de conteúdo semanticamente duplicado em módulos diferentes.

## Experiências descartadas

As duas experiências foram realizadas na bancada isolada, medidas pelo mesmo somatório gzip dos arquivos `.js` e removidas em seguida. Não houve mudança no orçamento.

| Configuração experimental do Turbopack | Total gzip | Resultado |
| --- | ---: | --- |
| Sem alteração, base `547d2fa` | 321.760 | Acima do limite. |
| `turbopackChunking: { minChunkSize: 300000, maxMergeChunkSize: 1000000 }` | 321.076 | Economizou 684 bytes; insuficiente. |
| `turbopackClientSideNestedAsyncChunking: false` | 324.852 | Aumentou 3.092 bytes em relação à base. |

Esses números são de builds locais, não de uma execução completa posterior do gate. Não se manteve configuração experimental. A investigação não encontrou candidato suficientemente grande com comportamento e compatibilidade preservados; nenhuma correção foi aceita.

## Varredura de dependências no cliente

A exportação foi percorrida pelos módulos pertencentes a saídas `[client-fs]`, incluindo carregamentos assíncronos, e pelos nomes associados a servidor, autenticação, segredos, provedores e instruções. Os exemplos abaixo são correspondências examinadas, não achados de vazamento. Os bytes são atribuídos na rota `/`.

| Origem e importador/cadeia | Identidade emitida e rota | Bytes | Disposição e evidência |
| --- | --- | ---: | --- |
| `workspace.tsx` → `next/dynamic` → `preload-chunks` → `work-async-storage.external` → `work-async-storage-instance` → `async-local-storage` | Módulos Next `[app-client]`, `/` | 151 + 188 + 422 | Suprimido: implementação de compatibilidade do framework; a fonte examinada contém substituto para runtime sem `AsyncLocalStorage`. |
| `error-boundary` → `navigation-untracked` → `server-async-storage.browser` | Variante `.browser.js` do Next `[app-client]`, `/` | 240 | Suprimido: a fonte define os singletons como `undefined` no navegador. |
| Bootstrap Next → `app-index` → `router-reducer` → `server-action-reducer` | Runtime Next `[app-client]`, `/` | 2.178 | Suprimido: código de roteamento do framework, não implementação de uma ação da aplicação. |
| `workspace.tsx` → estúdio → `use-exploration-loop` → journal → `exploration-plan-contract.mjs` | `@compor/agents-api` `[app-client]`, `/` | 1.226 | Suprimido: contrato puro para validação de plano e fatos no navegador; não é o módulo de assinatura ou o adaptador do fornecedor. |
| Estúdio → hook paralelo → dispatch → `parallel-exploration-observer.ts` | Módulo da aplicação `[app-client]`, `/` | 270 | Suprimido: correspondência textual de `server` dentro de `observer`; o módulo observa recibos. |

Não foram encontrados módulos de Server Action da aplicação nas saídas indexadas nem diretivas `use server` em `apps/web/app` e `apps/web/lib`; o redutor de Server Actions do Next acima não comprova uma ação da aplicação. Não foi confirmado vazamento de módulo exclusivo de servidor nesta varredura heurística. A ausência de correspondência não é prova de ausência de vazamento.

## Cobertura e lacunas

- As 48 rotas exportadas têm entradas e grupos com cobertura `exact`; os 40 gatilhos de grupo foram associados (`joined`). Três rotas possuem saídas de cliente indexadas: `/`, `/_global-error` e `/_not-found`.
- Dos 29 registros de saída de cliente por rota, 23 têm associação `exact` e seis são `not_a_chunk`: o runtime e o polyfill aparecem nas três rotas. Não se infere composição completa dessas saídas. Todos os 203 identificadores de módulos associados às saídas client têm registro de módulo.
- O levantamento por nomes e caminhos é heurístico; não é uma revisão de segurança integral nem análise de todas as variantes de comportamento. Não foram medidos requests reais de cliente, cache, latência nem efeito de novas fronteiras de carregamento.
- A inspeção priorizou dependências e módulos da exploração paralela para explicar o excedente. Não foi executada a passagem ampla de comunidades e corte mínimo; os candidatos foram examinados diretamente, e a ausência desse passo limita conclusões sobre outras otimizações possíveis.
- O gate continua falhando. Resolver o excedente requer uma mudança com redução demonstrada e testes equivalentes, ou uma decisão explícita sobre o contrato de desempenho/compatibilidade; a auditoria não altera esses contratos.
