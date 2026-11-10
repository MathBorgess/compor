# ADR 0032 — Gates por área alterada e falha rápida

- Estado: accepted
- Data: 09/11/2026
- Fonte: pedido de Matheus em 09/11/2026 para que as Actions "de fato representem gates para a qualidade do código e performance", sem estouro acima de 30 minutos e sem esgotar a cota do GitHub Actions. Na mesma data, ele aceitou executar por área nos PRs e tudo na `main`, a meta de 1.500 minutos cobrados por mês e o TBT como limite absoluto.

## Decisão

Num pull request, o workflow Quality executa só as áreas que a mudança pode afetar: `web`, `unit` e `site`. Push para `main` e execução manual executam todas. O job estático sempre executa, calcula as áreas e roda os passos do site quando `site` está ligada. As regras e seus testes ficam em `scripts/quality/changed-areas.mjs`. Um caminho sem regra liga todas as áreas.

O **Quality gate** exige sucesso do job estático. Os outros jobs passam com sucesso, ou quando foram pulados e a saída do estático diz que a área deles está desligada. Falha, cancelamento, job ausente, saída ausente ou job pulado com a área ligada reprovam o gate.

Cada teste tem limite padrão de 90 s na suíte web e de 60 s nos pacotes, no protótipo e em `scripts/quality`. Nenhum job passa de 20 minutos. O gate escreve no resumo da execução uma estimativa dos minutos cobrados, sem poder reprovar por causa dela.

Esta decisão substitui, no [ADR 0018](0018-gates-qualidade-e-performance.md), a regra de que o gate "só passa se todos os cinco jobs passarem" e de que job ignorado impede a aprovação. Também substitui, nos [gates](../quality/gates.md), a frase "Falha, cancelamento ou job ignorado bloqueiam o agregado". Um job pulado conta somente quando a área dele não mudou. Falha e cancelamento continuam bloqueando. O job Public site build do ADR 0018 passa a ser um passo do job estático. Os critérios, os orçamentos e o TBT de 200 ms continuam como estão.

## Limites

A regra por área supõe que cada arquivo só afeta as áreas mapeadas. Uma dependência fora do mapa passa no PR e só aparece no push para `main`. A estimativa de minutos não é a fatura do GitHub, e uma nova tentativa conta de novo os jobs reaproveitados. As estimativas por execução nos gates vêm de durações anteriores, não desta configuração. Exigir **Quality gate** na proteção da branch continua sendo uma configuração separada do GitHub.

## Atualização de 10/11/2026

Matheus pediu retirar o Quality do push na `main`, para evitar repetir a execução feita no PR. Esta decisão substitui somente o gatilho automático de push descrito acima: `pull_request` e `workflow_dispatch` permanecem; a execução manual continua cobrindo todas as áreas. Jobs, critérios do gate, orçamentos e limites não mudam. O workflow de migrations é separado e mantém seus gatilhos.

O PR passa a concentrar a verificação automática da alteração. Um push direto na `main` não recebe Quality automaticamente, e uma dependência fora do mapa de áreas deixa de ter a segunda execução automática completa após o merge. A execução manual completa permanece disponível para essas verificações; atualizar o mapa de áreas continua obrigatório quando uma dependência muda.
