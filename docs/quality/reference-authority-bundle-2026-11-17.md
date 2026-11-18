# Auditoria local do bundle em 93f3d7e

Escopo: todas as rotas, modo audit, sem alteração de código/configuração/dependências. Capture: authority-audit-93f3d7e; export /tmp/compor-authority-analyze-93f3d7e.jsonl.gz. Build Next 16.4.6 local concluído. Métrica do gate reproduzida exatamente: soma gzipSync por arquivo .js de .next/static, 15 arquivos, 334.267 bytes; teto 300.000, déficit 34.267. Não é transferência observada nem latência de imagem.

## Candidatos e limites

| Região | Evidência | Proposta/resultado |
| --- | --- | --- |
| Polyfill nomodule Next |39473B gzip real do arquivo;39434B atribuídos|Único arquivo dispensável apenas por uma decisão diferente de compatibilidade. Já é artefato precompilado do framework; não foi identificada configuração pública para removê-lo preservando contrato. Não propor apagar pós-build ou redirecionar arquivo interno.|
| Zod Mini |23923B atribuídos, uma versão; schema.ts já usa mini e locale inglês|Não há classic duplicado no cliente. Mesmo remover a região inteira não atinge o déficit, além de perder validação. Trocar validador exige equivalência ampla e medição; não há economia suficiente demonstrada.|
| markdown-to-jsx |6378B atribuídos; import direto studio-chat.tsx|Preserva Markdown do chat. Lazy-load pode mudar primeira renderização, mas o gate soma todos os chunks. Substituição não pode prometer economia equivalente com mesma semântica.|
| App |studio-app17103B, studio-chat13915B, journal5486B, estado5336B atribuídos|São responsabilidades diferentes e necessárias. Unificar código repetido pode gerar ganhos locais, mas não encontrei duplicação de módulos nem candidato comprovado de34.267 B. Remover caminho serial/recovery ou validações quebraria comportamento.|
| Next/React |react-dom63937B e runtime/router diversos|Não são dependências opcionais. Mudança de framework/runtime ou suporte de navegador é decisão arquitetural, não ajuste de bundling.|

Attribution não é economia; soma por fonte não deve ser confundida com gzip final por arquivo. Não há fonte JS repetida em dois outputs no export deduplicado por(filename,source_path). O experimento anterior de tornar recovery estático em 481b9a3 economizou 1.745 B, mas foi descartado por timing e insuficiência (arquivo /tmp/compor-bundle-481b9a3-medicoes.json).

## Método e cobertura

49 rotas; 17 outputs de cliente incluindo CSS;15 com membership exact, 2 not_a_chunk(runtime/polyfill). Grafo contém identidades completas e partes concatenadas. Atribuições cujas fontes não são membros explícitos foram mantidas como fontes, não convertidas em pesos exclusivos de um módulo composto. Label propagation determinístico sobre arestas sync simetrizadas, peso 1, até 20 passagens: comunidade framework, app, journal/visual e private-image-fetch. A atribuição parcial por identidade não autoriza concluir peso total da comunidade. Não existe alvo opcional identificado cuja remoção preserve o comportamento. Min-cut de deferral não resolve a métrica de TODOS os arquivos; não foi proposto como economia do gate. Async imports de studio-app, recovery e journal foram conferidos na fonte.

## Client-dependency scan

| Fonte/importador | Identidade emitida | Rotas | Bytes atribuídos | Disposição |
| --- | --- | --- | --- | --- |
| reference-authority-consent.ts / fluxo do estúdio |[app-client] ecmascript|/|320|Suprimido: capacidade efêmera da aba deliberadamente cliente; nenhum segredo servidor configurado.|
| @compor/agents-api / studio-chat,journal |contratos puros em app-client|/|5211 agregados|Suprimido: parsers/propostas/schemas públicos, não provider/signing.|
| @compor/agile-deliberation / estúdio |funções puras app-client|/|3099 agregados|Suprimido: deliberação/heurística local sem chave.|
| next server-action-reducer |runtime do framework app-client|/, rotas framework|2179|Suprimido: transporte React/Next, não implementação de Server Action de aplicação.|

## Possible server-only leaks

Nenhum vazamento concreto identificado. Não há referência de Server Action própria no conjunto emitido. Inspeção por nomes e importadores não é auditoria integral de segredo; os outputs runtime/polyfill não possuem enumeração modular, embora haja atribuição. Não foram encontrados SDK administrativo, driver de banco, provider OpenAI nem módulo de assinatura nos fontes atribuídos do cliente. Essa observação não substitui revisão de conteúdo em todos os caminhos futuros.

## Conclusão

Não foi demonstrada redução segura suficiente. O estado medido continua34.267 B acima do teto. Nenhum orçamento, medição, arquivo gerado ou compatibilidade foi alterado. Próxima hipótese precisa apontar código realmente redundante ou mudança arquitetural autorizada, seguida de snapshot antes/depois e testes; fragmentar mais chunks por si só não elimina o total.

## Evidência preservada e reprodução

A [medição versionada](reference-authority-bundle-2026-11-17.json) contém commit, versões, cada arquivo/byte gzip, total, orçamento e SHA-256 do export. Os caminhos temporários acima são artefatos locais auxiliares; os números e a conclusão permanecem neste repositório. Captura e build foram feitos em worktree isolada; nenhum build/servidor de outra tarefa foi interrompido. Mac: 32 GiB RAM, swap zero e 73% de memória livre antes da captura.

Reprodução no mesmo commit, após instalar os lockfiles, sem credenciais nem serviços pagos:

```sh
cd apps/web
node node_modules/next/dist/bin/next analyze --output --snapshot authority-audit-repro
set -o pipefail
node node_modules/next/dist/bin/next analyze export --snapshot authority-audit-repro | gzip > /tmp/compor-authority-repro.jsonl.gz
npm run build
```

Somar `gzipSync(bytes).length` de cada `.js` em `.next/static`, como em `scripts/quality/performance.mjs`; não excluir polyfills, chunks assíncronos ou manifests. Nomes de arquivos/build ID podem mudar e a igualdade byte a byte não é prometida. O build passou; Lighthouse e navegador não foram repetidos nesta auditoria, que não alterou implementação.

O [guia oficial de package bundling](https://nextjs.org/docs/app/guides/package-bundling) descreve análise e otimização de imports. A [documentação de browsers](https://nextjs.org/docs/architecture/supported-browsers) diferencia carregamento de polyfills e alvo Browserslist; isso não autoriza remover um arquivo precompilado do total medido nem garante manter a compatibilidade ao fazê-lo. Nenhuma configuração pública para eliminar esse artefato preservando o contrato foi identificada na inspeção local do Next instalado.
