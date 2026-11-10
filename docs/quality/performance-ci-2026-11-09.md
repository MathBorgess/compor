# Evidências de performance no CI — 09/11/2026

Este registro fecha o critério da [issue #27](https://github.com/MathBorgess/compor/issues/27) que pede três execuções seguidas com as medianas registradas. Ele continua o [registro de 06/11](performance-ci-2026-11-06.md).

O método e os orçamentos são os mesmos de 06/11: build de produção, entrada sem sessão, Lighthouse com perfil móvel e `throttlingMethod: simulate`, mediana de cinco medições. Os limites são TBT de 200 ms, LCP de 2.500 ms, CLS de 0,1, JavaScript inicial de 250.000 bytes gzip e total de 300.000 bytes gzip.

## O que mudou no aplicativo

Desde o commit `ab85797`, o `proxy.ts` responde `/` com HTML sem o runtime do App Router quando a pessoa não tem sessão ([ADR 0034](../adr/0034-entrada-leve-sem-runtime.md)). A página medida pelo gate não carrega nenhum arquivo JavaScript. Por isso o JavaScript inicial medido é zero. O total de JavaScript do cliente continua sendo medido sobre todo o build.

A causa da tarefa longa anterior foi identificada por perfil local antes dessa mudança: uma página `/` vazia ainda tinha a tarefa de cerca de 300 ms no CI. A tarefa vinha da inicialização do App Router e do React, não do código do estúdio.

## Cinco execuções seguidas

| Execução | Commit | TBT das cinco medições (ms) | Mediana do TBT | Mediana do LCP (ms) | Mediana do CLS | JS total (bytes gzip) | Job de performance | Quality gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [42684506557](https://github.com/MathBorgess/compor/actions/runs/42684506557) | `83b35f6` | 0; 0; 0; 0; 0 | 0 | 651 | 0,008 | 295.451 | aprovado | aprovado |
| [42684554468](https://github.com/MathBorgess/compor/actions/runs/42684554468) | `70c9257` | 0; 0; 0; 0; 0 | 0 | 667 | 0,008 | 295.647 | aprovado | falhou num teste web |
| [42684647757](https://github.com/MathBorgess/compor/actions/runs/42684647757) | `c728c14` | 0; 0; 0; 599; 0 | 0 | 664 | 0,008 | 295.959 | aprovado | falhou em testes web |
| [42722045907](https://github.com/MathBorgess/compor/actions/runs/42722045907) | `d25de70` | 8; 0; 0; 0; 0 | 0 | 659 | 0,008 | 295.647 | aprovado | aprovado |
| [42722139689](https://github.com/MathBorgess/compor/actions/runs/42722139689) | `c2c4f6c` | 0; 0; 0; 0; 0 | 0 | 668 | 0,008 | 295.959 | aprovado | aprovado |

As duas falhas do Quality gate vieram do job de comportamento web, não do job de performance. Uma era uma medição de layout feita durante uma animação. A outra era um arquivo de testes novo que não enviava o cookie de sessão. As duas foram corrigidas nos commits `d25de70` e `c2c4f6c`.

## O que estas medições não mostram

- Das 25 medições, 23 tiveram TBT zero. Uma teve 8 ms. Uma teve 599 ms, por uma tarefa de 714 ms que o Lighthouse não atribuiu a nenhuma URL. A página não carrega arquivo JavaScript, então a tarefa não veio de um chunk do aplicativo. A causa dessa tarefa não foi investigada. A mediana de cinco medições absorve uma medição assim. Três medições assim na mesma execução reprovariam o gate.
- O `benchmarkIndex` variou de 1.037 a 2.917 entre as medições. A capacidade do runner não é constante.
- O gate mede a entrada sem sessão. O estúdio depois do login não é medido pelo Lighthouse. Matheus decidiu em 09/11 não acrescentar essa medição por enquanto.
- O total de JavaScript está a cerca de 4.000 bytes do limite de 300.000. Uma mudança que acrescente código de cliente precisa remover código antes, como pede o ADR 0033.
- Nenhuma destas execuções foi na `main`. A execução na `main` acontece no merge final.
