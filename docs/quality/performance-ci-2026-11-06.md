# Evidências de performance no CI — 06/11/2026

O gate mede a entrada sem sessão, servida por build de produção com configuração pública sintética. O Lighthouse usa perfil móvel e `throttlingMethod: simulate`; o gate considera a mediana de cinco medições. O limite de TBT é 200 ms. Não houve medição de geração, sessão autenticada ou ambiente real de produção.

| Execução | Commit | TBT das cinco medições (ms) | Mediana | Resultado de performance |
| --- | --- | --- | --- | --- |
| [#17](https://github.com/MathBorgess/compor/actions/runs/42286781378) | `829d366` | 59; 126; 119; 116; 120 | 119 | aprovado |
| [#18](https://github.com/MathBorgess/compor/actions/runs/42297881970) | `5a48093` | 120; 324; 163; 344; 248 | 248 | falhou |
| [#19](https://github.com/MathBorgess/compor/actions/runs/42300414021) | `e04f658` | 215,5; 316; 153; 265; 323 | 265 | falhou |
| [#20](https://github.com/MathBorgess/compor/actions/runs/42301457234) | `5f6f842` | 183; 314; 326; 253; 282 | 282 | falhou |

Os quatro builds registraram 179.453 bytes gzip de JavaScript inicial e 295.264 bytes gzip no total; os orçamentos respectivos são 250.000 e 300.000 bytes. Os commits posteriores a `829d366` mudaram workflow, documentação, scripts, SQL ou diagnósticos, sem alterar o aplicativo ou dependências. O tamanho igual não é prova, por si só, de igualdade byte a byte dos bundles. As execuções usaram a mesma imagem Ubuntu 24.04 `20261101.360`, mas a carga e a capacidade efetiva do runner não foram estabelecidas. O gate completo passou em #17 e falhou em #18; em #19 o navegador foi cancelado com a atualização do head e o gate falhou. Em #20, performance falhou, site, estáticos e contratos passaram e o navegador ainda estava em execução na captura deste registro.

No #20, o `benchmarkIndex` foi 2019,5; 2005; 1960,5; 2004,5; 1982. Esse dado não estava nos logs anteriores e não permite comparar a capacidade dos runners históricos. Nas amostras 2–5, o audit de tarefas longas atribuiu ao chunk `13k2w6j-pr5xo.js` tarefas de 304, 364, 303 e 309 ms. Na primeira, a tarefa atribuída ao chunk `31d_wc_z4mbs4.js` foi 233 ms. As durações, menos 50 ms por tarefa, coincidem aritmeticamente com o TBT nas quatro primeiras amostras; essa coincidência não identifica uma função responsável. Na quinta, as tarefas do chunk listadas não explicam sozinhas o valor medido.

No Lighthouse usado aqui, a atribuição é a primeira URL JavaScript atribuível à tarefa, não necessariamente a origem da maior parte do trabalho. O audit de tarefas longas e a métrica de TBT usam simulações diferentes; os tempos listados não demonstram, isoladamente, a pertença à janela FCP–TTI nem uma causa específica. Os relatórios Lighthouse completos foram publicados como artifacts, mas a tentativa de leitura da URL temporária retornou HTTP 403 neste ambiente; não houve contorno da restrição. A execução local do Chromium pelo avaliador também ficou bloqueada pelo sandbox disponível, sem usar `--no-sandbox`.

Um experimento local sobre a base `829d366` ajustou a divisão de chunks do bundler (`maxMergeChunkSize=50000`, `minChunkSize=10000`, `requestCost=0`). O chunk `13k2w6j-pr5xo.js` permaneceu byte a byte idêntico, com 229.285 bytes brutos e 71.760 gzip; o JavaScript inicial cresceu de 179.453 para 180.404 bytes gzip, o total de 295.264 para 296.790, e os scripts iniciais de sete para dez. O build passou, mas não houve Lighthouse local; o experimento foi descartado e não demonstra melhoria ou piora de TBT.

O commit `5f6f842` apenas acrescenta diagnósticos sanitizados de tarefas longas e `benchmarkIndex`; não muda o orçamento, o método de medição ou o comportamento do aplicativo. As evidências apontam trabalho inicial associado a um chunk e variação entre execuções, mas ainda não comprovam a causa nem uma correção.
