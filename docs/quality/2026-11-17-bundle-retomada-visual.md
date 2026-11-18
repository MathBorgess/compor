# Bundle da retomada visual em 8d48357

A integração completa, já com o agrupamento de chunks da main, mede **332.568 bytes gzip**, 32.568 acima do orçamento de 300.000. Nenhuma redução suficiente foi demonstrada. Os números, hashes e maiores fontes estão na [evidência versionada](2026-11-17-bundle-retomada-visual.json). Esta medição substitui somente o baseline de tamanho da [auditoria anterior](reference-authority-bundle-2026-11-17.md), não seus contratos de produto.

Métrica: soma de `gzipSync(bytes).length` de todos os arquivos `.js` sob `.next/static`, como no gate; inclui polyfill, chunks assíncronos e manifests. Host macOS, Node 24.16.0, Next 16.4.6. Build passou. Escopo: todas as 49 rotas. Snapshot `bundle-integrated-8d48357-before`, export local `/tmp/compor-bundle-integrated-8d48357-before.jsonl.gz`; o hash e as medidas ficam preservados no JSON acima.

| Experimento isolado | Gzip total | Resultado |
| --- | ---: | --- |
| Baseline integrado | 332.568 | Déficit 32.568 |
| Reexports explícitos de Zod Mini | 332.568 | Ganho zero; revertido |
| Construção pura de 82 schemas em 11 arquivos | 332.447 | Ganho de 121 bytes, desproporcional à instrumentação; revertido |
| Agrupamento nativo: mínimo 10 MB, máximo de merge 30 MB, um chunk por grupo | 332.568 | Mesmos chunks, ganho zero; revertido |

Os três builds experimentais passaram. Nenhum patch de produção, dependência, flag, orçamento ou artefato gerado foi retido. Não houve chamadas pagas. Testes de navegador e Lighthouse não foram executados para as alterações descartadas; o build não comprova comportamento nem desempenho observado no navegador.

## Onde estão os bytes

Os maiores arquivos reais têm 125.546, 124.255, 39.473 (polyfill) e 29.887 bytes gzip. A atribuição por fonte identifica React DOM (63.931), polyfill (39.434), StudioApp (17.131), StudioChat (13.915), schemas do núcleo Zod (9.499) e Markdown (6.387). Esses valores de atribuição **não** equivalem à economia de remover ou substituir uma região.

Há uma única implementação Zod Mini no cliente, sem runtime clássico duplicado ou SDK Supabase no grafo emitido. Mesmo substituir Zod e Markdown não demonstra equivalência nem economia suficiente. Não foi proposto remover polyfill, diminuir compatibilidade, excluir arquivos da medição ou trocar de bundler. Uma troca ampla de validadores/renderer exigiria análise própria de equivalência dos refinamentos, defaults, erros, objetos estritos e Markdown; este relatório não a autoriza.

## Grafo, cobertura e dependências

Foram deduplicadas as partes por `(filename, source_path)`: 286 fontes JavaScript, nenhuma repetida entre outputs. Isso não prova ausência de funções semelhantes, mas descarta a hipótese de módulos inteiros de React/Next duplicados entre os chunks analisados. Há 12 outputs de cliente: 10 com membership exato e dois `not_a_chunk` (runtime/polyfill); 43 grupos têm trigger unido ao grafo. Arestas síncronas foram simetrizadas com peso 1 e propagação determinística de rótulos por até 20 passagens; a região principal convergiu numa comunidade grande. Não se identificou alvo opcional removível preservando todas as funcionalidades. Um corte para apenas adiar carregamento não reduz a métrica de todos os arquivos, portanto não foi apresentado como economia.

### Possíveis dependências exclusivas do servidor

Nenhum vazamento concreto identificado nesta auditoria. A varredura das fontes emitidas não encontrou provider OpenAI, assinatura com segredo, SDK administrativo nem driver de banco. Nomes não comprovam autoridade: os contratos públicos de `@compor/agents-api` e `@compor/agile-deliberation` são validação/propostas locais, e os clientes de autoridade/consentimento fazem HTTP ou conservam capacidade efêmera deliberadamente cliente.

### Matches suprimidos

O runtime `server-action-reducer`, `app-call-server`, `react-server-dom` e módulos de navegação/decodificação são transporte React/Next, não implementação de Server Action da aplicação. Não há `use server` próprio no app/lib analisados. A cadeia `next/dynamic → preload-chunks → work-async-storage` inclui 761 bytes atribuídos de shims; a fonte contém fallback sem store no navegador, sem sessão de servidor ou segredo. A remoção desse wrapper seria um candidato pequeno, ainda não implementado ou medido, e não resolve o déficit.

### Lacunas

Os dois outputs sem membership modular limitam a prova por grafo; seus bytes foram integralmente contados. Atribuição por caminho não foi convertida em pesos exclusivos para identidades compostas. Esta inspeção não é auditoria integral de segredos, isolamento ou carregamento real. O escopo de otimização foi encerrado após esses ensaios por prioridade de revisão funcional, preservando o bloqueio do gate.

## Reprodução

No mesmo commit e lockfiles, executar em `apps/web`:

```sh
node node_modules/next/dist/bin/next analyze --output --snapshot bundle-retomada-repro
set -o pipefail
node node_modules/next/dist/bin/next analyze export --snapshot bundle-retomada-repro | gzip > /tmp/compor-bundle-retomada-repro.jsonl.gz
npm run build
```

Somar gzip por arquivo como descrito acima; nomes de chunks/build ID podem variar. A bancada foi isolada, sem servidores persistentes ou containers iniciados e sem interromper processos de outras tarefas.
