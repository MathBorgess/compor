# Bundle do recorte de correções — 17/11/2026

Esta medição compara a `origin/main` em `9e61e188974990326729e9e58e7ccbb4f77e8350` com o candidato de código `0189245b915e946a4755207d9df7c753e257101a`. O recorte inclui correções do estúdio, imagens e Next.js; não inclui a exploração paralela ou a autoridade visual em desenvolvimento. O comparativo mede o conjunto, inclusive a troca do Next.js 16.4.4 para 16.4.6, e não permite atribuir a diferença integral a uma mudança isolada.

## Captura e método

- `next analyze --output --snapshot main-9e61e18` e `next analyze --output --snapshot release-0189245`, cada um na respectiva worktree com suas dependências de lockfile instaladas. Node.js `v24.16.0`; nenhum filtro de rota na captura.
- Cada snapshot foi exportado por `next analyze export --snapshot <nome> | gzip`, com `pipefail`. Os arquivos nesta execução são `/tmp/compor-release-main-9e61e18-analyze.jsonl.gz` e `/tmp/compor-release-0189245-analyze.jsonl.gz`; são artefatos locais temporários, não parte do repositório.
- Nos dois exports, o schema v1 lista 37 de 37 rotas e informa cobertura `exact` de entradas e grupos para todas. A análise abaixo seleciona os registros `part` da rota `/`, cujo output começa por `[client-fs]/` e termina em `.js`, e soma `compressed_size` uma vez por par `(filename, source_path)`. Essa medida é atribuição comprimida do analyzer; `source_path` não é identificador único de módulo. O resultado inclui código em grupos assíncronos e não descreve requisições observadas nem o carregamento inicial.
- As demais rotas não acrescentam novos pares de output e source a esse conjunto de JS cliente quando deduplicados no mesmo snapshot. Havia 586 registros de part antes e 588 depois entre todas as rotas, reduzidos, respectivamente, a 264 e 266 pares únicos; não houve valores conflitantes entre repetições do mesmo par. Os nomes dos outputs são próprios de cada build; a comparação de fontes abaixo soma os pares por caminho em cada snapshot, sem supor nomes estáveis entre builds.

## Resultado

| Medida | Main | Candidato | Diferença |
| --- | ---: | ---: | ---: |
| Atribuição comprimida de JS cliente na rota `/`, incluindo assíncronos | 356.745 bytes | 359.352 bytes | +2.607 bytes |
| Pares únicos de output e caminho de origem | 264 | 266 | +2 |
| Outputs JS com registros `part` | 9 | 9 | 0 |

As maiores diferenças positivas de atribuição por caminho, sem inferir causalidade exclusiva, foram `studio-chat.tsx` (+789 bytes), `studio-image.ts` (+520), `use-exploration-loop.ts` (+380), `studio-reference-panel.tsx` (+324), `use-object-url.ts` (+306), `release-object-url.ts` (+230) e `studio-app.tsx` (+216). Algumas fontes diminuíram, incluindo `studio-editor.tsx` (−82) e `studio-variant-cards.tsx` (−76). As mudanças de minificação e agrupamento também podem alterar essas atribuições.

Na rota `/`, ambos os snapshots apresentam 12 outputs cliente com membros `exact` e dois `not_a_chunk` — runtime e polyfill pré-compilado, cuja associação interna de módulos não é enumerada. Há 12 grupos `render_dependent`, três `async` e um `bootstrap`, todos com trigger associado. A cobertura exata dos grupos não comprova quando um output é solicitado. A comparação não é uma auditoria completa de dependências cliente nem comprova ausência de conteúdo exclusivo de servidor no bundle.

## Gate de performance

No candidato de código, após `quality:build`, `quality:performance` passou com cinco execuções Lighthouse locais em Chromium. O avaliador somou **299.792 bytes gzip de todos os arquivos `.js` em `.next/static`**, frente ao orçamento de 300.000 bytes: margem de **208 bytes**. Esta medida real de arquivos emitidos usa outra unidade de análise que as atribuições por fonte acima e não deve ser comparada diretamente à soma de `part`.

O cenário do gate é a entrada sem sessão, com configuração pública sintética e chamadas à OpenAI/Supabase bloqueadas. O avaliador registrou `initialJavascriptGzipBytes: 0`; esse número, isoladamente, não demonstra ausência de transferência de JavaScript no navegador. A margem pequena exige verificar o mesmo gate no CI; este resultado local não comprova latência real, uso autenticado, geração ou aprovação em outro ambiente.
