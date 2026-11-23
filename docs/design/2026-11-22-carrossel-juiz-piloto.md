# Piloto de repetibilidade do juiz visual

Em 22/11/2026, renderizamos seis pares sintéticos de quatro lâminas em Chromium. A revisão cega do `gpt-6.1-terra` via Codex CLI reconheceu os três defeitos plantados e classificou três pares como livres de defeitos críticos. Os rótulos foram congelados antes do julgamento de cada diagnóstico. O `gpt-6.2-astra` usou o mesmo transporte, com duas repetições em cada ordem A/B e B/A por diagnóstico.

| Diagnóstico | Preferência e defeito plantado | Divergências frente à referência |
| --- | --- | --- |
| Autonomia da segunda lâmina, rubrica inicial | Preferiu a versão íntegra e detectou a dependência nas quatro sessões. | A referência também marcou a dimensão editorial na mesma lâmina. As quatro sessões classificaram só o defeito primário. O desvio-padrão chegou a 0,433 em editorial e 0,354 em ritmo. O erro absoluto médio chegou a 0,875 em voz e 1,0 em fechamento. |
| Pedidos empilhados no fechamento, rubrica revisada | Preferiu a versão íntegra e detectou os cinco pedidos concorrentes nas quatro sessões. | Uma sessão na ordem inversa marcou a arte compartilhada como defeito crítico nos dois lados, sem correspondente na referência. O desvio-padrão chegou a 0,354 em arte–mensagem e hierarquia. O erro absoluto médio chegou a 1,0 em capa e editorial e 0,875 em ritmo. |

A rubrica revisada atribui cada defeito à dimensão primária, exige evidência própria para um defeito adicional, diferencia pedidos de interação das instruções da peça e fixa âncoras inteiras de 0 a 5. O validador recusa evidência literal repetida na mesma lâmina e conserva o teto 2 onde houver defeito crítico. A revisão recebe um novo hash de rubrica. [Rubrica do juiz](../../scripts/evals/carrossel/judge-evidence.mjs)

Os dois diagnósticos tiveram a mesma preferência nas ordens invertidas e ultrapassaram o limiar de desvio-padrão de 0,35 em pelo menos uma dimensão. Cada rubrica foi observada em um caso diferente, o que impede estimar o efeito da revisão. A referência foi produzida por outro modelo. A calibração exige a coorte completa e recibos da Agents API. A promoção também depende dos gates das partições seladas. Imagens, rótulos e recibos do piloto estão fora do Git. [Protocolo de calibração](../../scripts/evals/carrossel/README.md#calibração-do-juiz-visual)

## A/B emparelhado no mesmo diagnóstico

Em 23/11/2026, oito sessões independentes de Codex CLI avaliaram o mesmo par de CTA empilhado, os mesmos JPEGs e a mesma referência congelada. Cada condição repetiu A/B e B/A. A âncora acrescentada torna explícito o teto 2 quando retirar a decoração preserva toda a informação. A classificação crítica exige distorção, leitura enganosa ou ocultação de conteúdo essencial com evidência na lâmina.

| Medida | Rubrica anterior | Com a âncora |
| --- | ---: | ---: |
| Críticos em arte divergentes da referência | 0 | 0 |
| Detecção do CTA empilhado e preferência pela peça íntegra | 4/4 | 4/4 |
| Desvio-padrão e erro absoluto médio em arte–mensagem | 0,354 e 0,75 | 0 e 0 |
| Maior desvio-padrão e maior erro médio entre dimensões | 0,354 e 1,0 | 0,354 e 1,0 |

A métrica primária de divergências críticas empatou. A âncora expressa o teto já definido para arte decorativa e corrigiu a aderência das notas dessa dimensão neste par. A repetibilidade global ainda excedeu 0,35. A referência veio de outro modelo e o transporte deste ensaio foi Codex CLI. O ensaio preservou os casos reservados. [Rubrica do juiz](../../scripts/evals/carrossel/judge-evidence.mjs)

## Calibração pela Agents API

Em 23/11/2026, a Agents API executou 24 sessões distintas de `gpt-6.2-astra` em uma coorte nova de seis pares. Cada caso teve duas repetições em cada ordem. Os 48 JPEGs foram renderizados em Chromium. Uma leitura independente dos JPEGs congelou os oito escores, a preferência e os defeitos críticos antes do primeiro envio. Os casos reservados permaneceram fora do lote. Quatorze recibos trouxeram dados de uso, cobertura insuficiente para um total de consumo.

| Medida | Observado | Limite |
| --- | ---: | ---: |
| Concordância nas quatro sessões do caso | 5/6 (83,3%) | ≥ 80% |
| Defeitos críticos omitidos | 0 | 0 |
| Classificações críticas fora da referência congelada | 8 | 0 |
| Maior desvio-padrão de repetição | 0,323 em arte–mensagem | < 0,35 em cada dimensão |
| Erro médio em hierarquia, ritmo e voz | 0,917 / 1,000 / 0,833 | ≤ 0,75 em cada dimensão |

O gate reprovou a calibração. O único desacordo de preferência ocorreu no caso de empate, com um voto isolado pela candidata. Quatro classificações críticas extras apontaram a mesma seta entre duas categorias do mural, que podia representar transferência entre colunas. Duas apontaram triângulos na mesma orientação em um slide sobre posição invertida. As duas restantes apontaram a ausência da prova de rascunho em uma das capas. As primeiras seis observações expõem deficiências potenciais dos diagramas compartilhados, que a leitura de referência não marcou. O relatório mantém a comparação com os rótulos congelados.

O SHA-256 dos rótulos foi `0d465a21aaa571494ea681224abd801bb232aa756b7cbe468bbeb694cdbc0493`. A rubrica da execução tem o digest `8ffaa85c31f1d542d21efea60338f66032fd4e2c3fa86a4fed8391c6545d5bb6`. O relatório verificável tem SHA-256 `9067070f304e27c2c3faaf3954bb0ce6a66019211589b28d62b1b6ce9a3764f3`. Rótulos, entradas e recibos foram preservados fora do Git. [Protocolo de calibração](../../scripts/evals/carrossel/README.md#calibração-do-juiz-visual)
