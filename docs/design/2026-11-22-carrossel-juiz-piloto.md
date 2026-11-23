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

## Comparação das correções nos casos de desenvolvimento

O Chromium renderizou as correções do mural e do zine com o código de `6084f63`. A comparação conservou as legendas e os cinco JPEGs das lâminas sem edição byte a byte. As duas coleções renderizadas passaram nos 56 checks por lâmina e nos quatro de coleção. Os casos foram escolhidos após o diagnóstico da calibração.

| Caso | Correção observada | Julgamento cego nas duas ordens |
| --- | --- | --- |
| Mural da oficina | Dois exemplos em placas separadas para pedidos e dúvidas. | Preferiu a correção nas duas ordens. As duas sessões marcaram a seta original como defeito crítico de arte–mensagem e nenhuma marcou um defeito crítico na correção. |
| Prova do zine | A capa mostra uma ilustração da folha de rascunho. A lâmina 3 compara a mesma amostra em pé e girada em 180°. | Preferiu a correção nas duas ordens e citou as mudanças na capa e na orientação. Arte–mensagem recebeu 2 e 2 no original, 4 e 5 na correção. |

A Agents API produziu quatro recibos distintos de `gpt-6.2-astra` com a rubrica da calibração anterior. Os relatórios pareados do mural e do zine têm SHA-256 `68cc6b1de571d42b94d72cd95f45b891501b04c51bbebb04409a4e3b1852a73d` e `0ea597dbaea90c9c5ffd6a6d5c08d692d6015e83ebe9c34b91c36e0ef3d9705c`. A coorte de calibração anterior segue reprovada. Uma nova coorte calibrada ainda é necessária para abrir os casos reservados. [Diagramas governados](../adr/0082-renderizador-deterministico-de-carrossel.md#diagramas-de-categorias-e-orientação)

## Segunda calibração

A análise das notas da primeira coorte encontrou desvios médios assinados de +0,917 em hierarquia, +1,000 em ritmo e +0,792 em voz. Em ritmo, 48 notas do juiz foram 5 frente a uma referência uniforme de 4. A rubrica de `703e8aa` descreve que evidência diferencia 4 de 5 em cada dimensão e pede um efeito concreto para sustentar a preferência num par. O leitor de recibos exige a escala inteira usada pelas instruções. [Rubrica](../../scripts/evals/carrossel/judge-evidence.mjs)

Dois autores prepararam seis pares inéditos com 52 JPEGs. A coorte incluiu dois pares válidos e quatro com um defeito crítico. Os quatro defeitos foram corte de título no perfil, resultado incompatível com a ficha, três pedidos de interação no fechamento e destinos trocados em um diagrama. O desvio da capa foi introduzido antes da captura em Chromium. A referência revisou JPEGs, recortes e legendas com a autoria e a intenção dos controles ocultas, registrou evidência para as oito notas por lado e congelou o SHA-256 `4fc4a85f1a0d11f20582339125d1eada53801791d66330b53138ebe4d8c43f5c` antes da primeira sessão. A execução usa a rubrica `d9a28c9e95394a12a1d53c6984bc9af872500fa37459f5f4939a46504f104d27`. Os casos de reserva e confirmação ficaram fora da coorte.

As 24 sessões distintas completaram os doze pares. Dezesseis recibos trouxeram dados de uso. A calibração reprovou na comparação com os rótulos congelados.

| Medida | Observado | Limite |
| --- | ---: | ---: |
| Concordância com o veredito nas quatro sessões | 5/6 (83,3%) | ≥ 80% |
| Defeitos críticos omitidos | 0 | 0 |
| Classificações críticas fora da referência | 8 | 0 |
| Maior desvio-padrão entre repetições | 0,228 em editorial e arte–mensagem | < 0,35 |
| Erro médio em arte–mensagem e ritmo | 0,979 / 0,833 | ≤ 0,75 em cada dimensão |
| Erro médio em hierarquia e voz | 0,042 / 0,250 | ≤ 0,75 em cada dimensão |

As oito classificações extras recaíram no mesmo comparativo da lâmina 3 de um guia de bordado. O diagrama dos dois lados contrapôs “Cobre o furo” a “Sai do bastidor”, sugerindo que a sombra devia sair do bastidor. O teste do briefing verifica se o próximo furo está visível. As quatro sessões apontaram essa diferença nos dois lados. O outro desacordo foi de preferência no guia de cartazes, com dois empates e dois votos no mesmo lado, diferente da referência. Os valores de erro das duas calibrações vêm de coortes distintas. O relatório desta coorte tem SHA-256 `1c2e8a4707448bb90e141e63d522b8271162ffd7690f757d499c555a3deacb37`.

Um replay de desenvolvimento substituiu as placas do guia por “Furo encoberto” e “Furo visível” e passou nos sete checks da lâmina e nos dois checks de coleção. O diff de pixels ficou restrito à região do diagrama. O relatório da calibração continua baseado nos JPEGs congelados. O planejador do estúdio e da bancada passou a conferir se os exemplos aplicam o mesmo critério de decisão que o briefing e a lâmina. O SHA-256 do diagnóstico do replay é `7971047e9534f1dfe6d04053e5078bdb706ba20c546646975e06ff7f2e91d01c`.

No replay cego desse caso conhecido, as duas ordens preferiram a correção. O juiz deu 2 em arte–mensagem às duas apresentações da versão original e 5 às duas da versão corrigida. O original recebeu um apontamento crítico sobre a lâmina 3 em cada sessão. A correção recebeu zero apontamentos críticos. As outras três lâminas e a legenda foram conferidas byte a byte. O relatório pareado tem SHA-256 `be381495886d906d34708913e35d447e74897966458d4f72e1e3bad0a6618f87`. A calibração continua reprovada com os rótulos e as notas originais.

O preflight optativo de autoria agora compara as associações de `category_split` com um contrato privado, vinculado ao SHA-256 do plano. Em uma reconstrução dos planos do bordado, identificou a versão original como divergente e aprovou os pares do replay. As lâminas sem associações declaradas ficaram sem verificação. A próxima referência cega pode revisar as lâminas compartilhadas em ambos os contextos e resolver desacordos de nota ou severidade antes de congelar os rótulos. [Protocolo de calibração](../../scripts/evals/carrossel/README.md#calibração-do-juiz-visual)
