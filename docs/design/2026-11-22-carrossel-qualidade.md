# Qualidade de carrosséis e revisão no estúdio

**Especificação de implementação e validação · 22/11/2026.** O ponto de partida é a revisão `720628e`, que inclui o fluxo Capa Âncora e as skills criativas do Marco 5. Consulte as [fontes de plataforma](2026-11-22-carrossel-fontes.md) e o [contrato atual de formatos](../adr/0080-skills-criativas-copy-e-modos-de-post.md).

## Fluxo da pessoa criadora

Preparar um carrossel deixa a pessoa escolher de 3 a 10 lâminas, revisar o roteiro e gerar a capa. A ação explícita de continuar usa a âncora no fluxo de geração existente. O painel de revisão mostra o progresso do conjunto, quais lâminas aguardam imagem e o caminho de volta ao editor. O download individual atende a correções de uma lâmina. O download do conjunto entrega um ZIP ordenado em uma ação, com as imagens e a legenda. Uma exportação de conjunto exige todas as imagens que aparecem no plano. Salvar versão e baixar são ações próprias e podem ser observadas separadamente.

As versões anteriores permanecem legíveis pelo caminho histórico. Uma reabertura sem a cópia local exige vínculo durável e autorização para cada imagem da versão. A confirmação de uma lâmina não autoriza as demais. A persistência, a recuperação e o estado de aprovação precisam ser verificados em sessão nova antes de apresentar um deck como completo.

## Composição e autorização

O plano liga texto, papel narrativo, fonte, acessibilidade e layout a IDs estáveis. O compositor inicial recebe um documento com slots validados, uma paleta e imagens já disponíveis. Usa HTML/CSS governado e diagramas definidos no código. Valida entrada, mede geometria e contraste e exporta JPEG 4:5. O motor está isolado no ambiente de avaliação para medir o contrato sobre arte e texto separados antes de alterar o formato canônico do estúdio. Um renderer online requer provar como seus bytes entram no mesmo fluxo de prévia, armazenamento, recuperação e exportação, além de uma revisão do contrato de arte integral. Para o primeiro fluxo de produto, o painel usa os pixels e as autorizações existentes.

O lote de pesquisa usa somente briefings sintéticos. A credencial fornecida na sessão fica em memória e o ledger guarda apenas IDs, estados, hashes e uso, em área privada. Uma resposta indeterminada interrompe novas chamadas do mesmo caso até reconciliação. Nenhuma revisão de qualidade deve transformar um indicador de rede ausente em autorização para repetir uma operação.

## Evidência e promoção

A avaliação começa com o comportamento atual no C0, depois passa por higiene física, planejamento editorial, direção de arte, fechamento e uma confirmação adicional no C5. A suíte de desenvolvimento guia as mudanças. Cada avaliação preserva a primeira passagem e eventual reparo de uma mesma candidata. CQS depende de evidência nas três camadas, e a decisão exige as verificações bloqueantes completas. Uma recusa prevista pode confirmar o gate factual sem produzir uma arte. Uma rodada simulada prova execução ou geometria; a qualidade de uma candidata paga depende dos artefatos reais e do julgamento calibrado.

O Marco 5 R4 registrou dois carrosséis prontos em dois casos de desenvolvimento na régua anterior. Isso é uma referência histórica de regressão, com unidades e escala próprias. Os 6 casos de reserva inéditos entram fechados na confirmação. Na leitura A/B, as duas ordens pertencem ao mesmo caso. O relatório mostra numerador, denominador, empates, divergências e abstinências. Com seis casos, os limites de 60% e 65% convergem para 4/6, e 85% exige 6/6.

A release passa pela integração Git da Vercel. Os checks da revisão final e as condições de promoção do benchmark precisam estar verificadas antes do merge. Depois, a evidência de produção associa o alias ao commit servido e verifica a ação que mudou no fluxo.

## Execuções observadas em 22/11/2026

O controle pareado usou o briefing sintético de leitura mobile da Traço Claro, quatro lâminas. Cada linha abaixo descreve a evidência obtida durante a implementação. As escolhas do planejador e as falhas da primeira passagem permanecem nos recibos privados.

| Ciclo | Evidência observada |
| --- | --- |
| C0 | O fluxo com skills v4 completou o planejamento e gerou quatro PNGs pela API. É o controle visual para a comparação do caso. |
| C1 | O planejador devolveu diagramas como objetos com rótulos. O validador da primeira passagem aceitou apenas tipos literais e bloqueou a arte. O contrato passou a aceitar rótulos em slots governados. |
| C2 | A primeira passagem do controle excedeu o limite de palavras de um rótulo. Dois briefings adversariais adicionais pediram uma estatística sem lastro e um print falso. O planejador recusou ambos antes de gerar imagens. |
| C3 | O controle ainda teve um rótulo acima do limite. Um caso de desenvolvimento sobre café gerou uma arte limpa de capa via Images API e rendeu quatro JPEGs com todos os checks físicos observados em primeira passagem. |
| C4 | O destaque escolhido na última lâmina estava fora do texto da manchete. O planejador parou antes da renderização. |
| C5 | O controle rendeu quatro JPEGs. O ajuste da tipografia da lâmina 2 preservou as outras três, verificadas por hash, e fez os sete checks físicos passarem. A lista de dez capas ficou ausente. |

Duas sessões cegas de Codex com o mesmo briefing favoreceram o C0 nas duas ordens. O controle mostrou as diferenças de escala, contraste e hierarquia com exemplos que funcionam visualmente. A candidata baseada em diagramas exigiu mais texto para transmitir as diferenças. Cada ordem mediu o mesmo briefing, portanto a comparação cobre um caso. O juiz continua sem calibração humana e o CQS permanece indisponível. Os 6 casos de reserva e 6 de confirmação foram preparados e congelados fora do Git. A rodada manteve os casos selados para uma candidata apta.

O compositor local validou 15 JPEGs em dois decks que cobrem os 12 arquétipos. No estúdio, o teste Chromium verificou prévia 3:4, salvamento direto na revisão a 390 px, recuperação após recarga e um ZIP com os cinco PNGs originais em ordem e a legenda UTF-8. A geração do produto ainda segue a arquitetura de arte integral. A recuperação das lâminas adicionais em outro dispositivo depende de um vínculo por lâmina e por versão.

O preflight da publicação confirmou que o alias de produção respondia no commit `720628e`. Nesse commit, o GitHub impediu iniciar os checks do PR #77 e da automação de migrations por pagamento ou limite de gastos, e o job `Apply migrations or initialize baseline` foi pulado. A causa da atribuição do alias pela Vercel permanece incerta. Essa evidência pertence à release anterior. [PR #77](https://github.com/MathBorgess/compor/pull/77) · [Run de migrations](https://github.com/MathBorgess/compor/actions/runs/45085893471)

## Continuação em 22/11/2026

O salvamento privado passou a associar cada PNG preparado à lâmina e à versão. O teste Chromium a 390 px verificou a interrupção parcial, a conclusão explícita na mesma versão e a transferência do conjunto para um contexto novo com IndexedDB vazio. O ZIP recuperado manteve hashes, ordem e legenda. O limite de 2048 px e 4 MiB por PNG continua. [ADR 0081](../adr/0081-imagens-do-carrossel-na-versao-salva.md)

Três diagramas governados demonstram escala, contraste e hierarquia com comparações da mesma amostra. O Lab exige dez opções, ranking válido das que cabem no orçamento e vencedora idêntica à manchete. O avaliador verifica os hashes do plano, da seleção e da execução selada. A identificação local de números sem lastro antecede a geração de pixels. A novidade aceita vetores e juízos de ganho identificados por plano e copy.

Na réplica paga do C5 em desenvolvimento, o Lab passou com dez opções. O planejador transferiu o CTA para um campo reservado a um trecho do título, e a primeira passagem foi bloqueada. Um replay moveu o CTA literal para o corpo e corrigiu a distância entre o rótulo da capa e o diagrama. Os quatro JPEGs finais passaram os checks físicos. O adversarial com promessa de rendimento sem fonte foi recusado novamente antes da imagem.

Na dupla leitura cega desse replay, o C0 continuou preferido. Os dois pareceres apontaram melhora nas comparações visuais de escala e contraste, com perda de continuidade no fechamento e menor força no gancho. Essa comparação ainda cobre um briefing de desenvolvimento. CQS, calibração e reserva seguem pendentes.

## Rota de composição e calibração verificável

O teste HTTP do Next com autenticação simulada e Chromium real confirmou a recusa de outro projeto, a retenção de um plano editorial reprovado e o ZIP para três lâminas válidas. Os JPEGs preservaram os hashes do manifesto e incluíam perfil sRGB, 1080 × 1350, 4:4:4 e codificação não progressiva. O ZIP levou legenda e alt text. O teste também verificou a capa de perfil em 270 × 360 e os pareceres físicos da primeira passagem e da renderização final. O compositor compartilha o pacote dos arquétipos com o laboratório. [ADR 0082](../adr/0082-renderizador-deterministico-de-carrossel.md).

A CLI recalcula a calibração a partir de rótulos de referência e das duas ordens de julgamento. Na promoção de C4 e C5, as notas e os votos precisam corresponder às lâminas, ao briefing, à legenda e à rubrica utilizados. Os controles simulados passaram. A calibração observada do juiz e a comparação na reserva continuam pendentes. [Protocolo da bancada](../../scripts/evals/carrossel/README.md).

## Demonstração no fechamento

Os dois pareceres do briefing de desenvolvimento Traço Claro apontaram que a candidata demonstrava escala e contraste, mas descrevia hierarquia em prosa na mesma área do convite para salvar. O layout `cta_closing` passou a admitir a demonstração exigida pelo briefing em uma faixa superior. O pedido de interação fica abaixo, em um bloco próprio. O Lab também passou a priorizar uma tensão concreta da situação de uso no ranking das manchetes.

No replay local de Traço Claro, somente o plano da lâmina 4 foi editado. A comparação de hierarquia ocupou 22,3% da lâmina, passou nas verificações físicas sem reparo e ficou legível na inspeção a 360 px. A lâmina 2 ainda precisou do ajuste tipográfico já observado. Ao renderizar os dois planos, as lâminas 2 e 3 produziram JPEGs idênticos. Na capa, 17 pixels oscilaram em um nível por canal. O salvamento de uma versão usa o JPEG canônico da composição já concluída. O replay é de um caso de desenvolvimento e antecede o julgamento da nova candidata. [Contrato do renderizador](../adr/0082-renderizador-deterministico-de-carrossel.md#diagramas-de-categorias-e-orientação)

## Nova candidata de desenvolvimento

Uma geração C5 da revisão `ecd0c3d3973ed94a8e27918d2d0fcedd73eac582c14f4c68364e0c30874ed41e` produziu quatro lâminas sem solicitar imagem. O Lab validou as dez manchetes e o ranking. A primeira passagem registrou a manchete da capa fora da margem segura. Um ajuste de tamanho resolveu a falha física. A última lâmina demonstrou hierarquia com os mesmos três elementos nos dois exemplos e um pedido de salvar em bloco separado.

O juiz calibrado recebeu os PNGs originais do C0 e os JPEGs finais do C5, com as respectivas legendas e o mesmo briefing. Uma ordem preferiu o C0 e a outra preferiu o C5. O C0 situou melhor a revisão antes de exportar no Canva. O C5 demonstrou com mais precisão a alteração de escala na frase. As duas ordens deram 5 ao fechamento de ambas as coleções. O juiz apontou rótulos pequenos na demonstração final e uma instrução genérica na segunda lâmina do C5. Uma ordem também observou que a segunda lâmina repete a comparação já apresentada na capa.

O relatório de SHA-256 `3dc873adeddcb0eb4337b5d8c58fe46dbcb7b23601f210f7f6d9c99454fc82ad` registra um caso inconclusivo de desenvolvimento. CQS e promoção ainda dependem da evidência completa. A reserva e a confirmação seguem seladas. [Calibração do juiz](2026-11-22-carrossel-juiz-piloto.md#terceira-calibração)
