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

A bancada derivou as quatro vistas do juiz dos PNGs originais do C0 e dos JPEGs finais do C5. O juiz recebeu essas vistas, as respectivas legendas e o mesmo briefing. Uma ordem preferiu o C0 e a outra preferiu o C5. O C0 situou melhor a revisão antes de exportar no Canva. O C5 demonstrou com mais precisão a alteração de escala na frase. As duas ordens deram 5 ao fechamento de ambas as coleções. O juiz apontou rótulos pequenos na demonstração final e uma instrução genérica na segunda lâmina do C5. Uma ordem também observou que a segunda lâmina repete a comparação já apresentada na capa.

O relatório de SHA-256 `3dc873adeddcb0eb4337b5d8c58fe46dbcb7b23601f210f7f6d9c99454fc82ad` registra um caso inconclusivo de desenvolvimento. CQS e promoção ainda dependem da evidência completa. A reserva e a confirmação seguem seladas. [Calibração do juiz](2026-11-22-carrossel-juiz-piloto.md#terceira-calibração)

## Promessa da capa e entrega da segunda lâmina

O estúdio e o Lab compartilham a instrução de planejar a dupla. A capa apresenta a promessa e a situação de uso. A segunda lâmina entrega a primeira decisão, com critério observável e ação quando o formato pede um guia. Quando o briefing exige prova na capa, a segunda lâmina extrai outra decisão do mesmo contexto. O ranking rebaixa opções que já resolvem a questão da segunda lâmina.

O ensaio de desenvolvimento congelou a candidata `bb36a3232efed8300f409bd1db5fb8b62cac90da397e823edad6c084c1c7bb91` e fez três sessões de planejamento e seis de julgamento, sem gerar imagens raster. Cada comparação usou o mesmo briefing e as duas ordens. Para o par C5 de Traço Claro, o plano anterior foi renderizado com o mesmo compositor da candidata. A comparação com C0 usou as vistas derivadas dos PNGs originais do controle.

| Comparação | Parecer | SHA-256 do relatório |
| --- | --- | --- |
| Traço Claro, C5 anterior e novo | A candidata venceu nas duas ordens. A promessa de três motivos ficou na manchete. A segunda lâmina trocou a repetição de escala por um teste de contraste. | `73c48c04a86deff41c73191a5e255e3ed8b12ca68007544488f9fc5644b8d891` |
| Traço Claro, C0 e C5 novo | A candidata venceu nas duas ordens. A demonstração permite observar a mudança de tamanho da frase dentro de quadros equivalentes. | `f8d65acc642db7901bf28ad9efc576a9e2e9c9cd047b48bfa1d32159effb15d8` |
| Notas de revisão, C5 anterior e novo | A candidata venceu nas duas ordens. As três notas numeradas correspondem a três testes, com ações específicas. Arte–mensagem recebeu 3 e 2. | `7e7be25f707092332a69657e8607ad488d264aecd4e74719f07610916033c0be` |

As duas versões de notas passaram na primeira renderização. Na candidata de Traço Claro, a manchete é diferente do exemplo da segunda lâmina, e o corpo da capa em `svg_diagram` ainda precisou de um ajuste para a margem inferior. Os dois briefings medem um avanço localizado. A nota de arte–mensagem das notas seriadas ficou abaixo do piso de 3,5, e a promoção segue pendente. [Protocolo da promoção](../../scripts/evals/carrossel/README.md#reserva-confirmação-e-calibração)

Em seguida, a grade passou a reservar espaço para a cópia antes de preencher a faixa gráfica das capas com diagrama. Os dois planos de Traço Claro renderizaram suas quatro lâminas sem reparo no replay. Na capa da candidata, o título manteve 116 px e o corpo 46 px. O diagrama ficou com 303 px de altura e os glifos do corpo terminaram em y = 1.166,69 px. O replay verificou a margem no recorte 3:4 e no feed a 360 px. Os pareceres da tabela estão vinculados à revisão congelada do ensaio. [Grade das capas](../adr/0082-renderizador-deterministico-de-carrossel.md#diagramas-de-categorias-e-orientação)

Um revisor Codex leu os 18 JPEGs com a autoria omitida e registrou a evidência de ganho por lâmina. Uma requisição de `text-embedding-3-small` forneceu 16 vetores. Os dois fechamentos só com CTA ficaram fora da medição. A CLI de novidade verificou os vínculos das observações com os planos finais. Em Traço Claro, o MIG subiu de 0,625 para 0,875, e a segunda lâmina deixou de ficar abaixo do piso individual de 0,50. Nas notas seriadas, o MIG foi de 0,875 para 0,938. A leitura é de dois briefings de desenvolvimento e mede novidade, uma das entradas de CQS.

Um protótipo local colocou uma comparação de contraste sob o texto da nota 02. As quatro notas preservaram a âncora em y = 300 px e a mídia apareceu em uma das cinco lâminas. Os dois pareceres preferiram o protótipo e deram 3 em arte–mensagem, ante 2 para o controle dessa comparação. O juiz reconheceu que o par resolve a dúvida de contraste. Tamanho e hierarquia ainda exigem recorrer ao texto. O protótipo está abaixo do piso de 3,5. O relatório tem SHA-256 `2ba4f93ded05fce265da35c4b8d047c87cfa4b5f386406cd3e723f3332bd2a4f`.

O runner passou a materializar o controle C3 na reserva e a aceitar o C0 integral do checkout `720628e`, com PNGs, legenda e recibos preservados. Os testes com suíte sintética verificaram esses vínculos, rejeitaram um JPEG adulterado e mantiveram a trava diante de resultado incerto. A reserva de promoção permanece selada. [Controle integral C0](../../scripts/evals/carrossel/README.md#controle-integral-c0)

## Demonstração de leitura na série de notas

No caso público `dev-notas-revisao`, um primeiro protótipo mostrou contraste e manteve tamanho e hierarquia nas instruções escritas. O comparativo seguinte testou uma matriz que conserva a amostra “Oferta” e muda tamanho, contraste ou peso em uma linha por vez. Em cinco lâminas, as quatro notas conservaram a âncora em y=300. A matriz ocupou uma lâmina, com cobertura visual de 20% na coleção e rótulos de 12,33 px na prévia a 360 px. Os checks físicos passaram na primeira renderização do protótipo.

No comparativo de uma única coleção de desenvolvimento, as duas ordens favoreceram a matriz. O juiz calibrado pontuou arte–mensagem em 5/5 nas duas ordens, frente a 3/5 para o protótipo que demonstrava contraste. A dimensão de hierarquia visual recebeu 4/5. A observação se refere ao ensaio montado manualmente, com o corpo e o alt da nota que recebe o quadro ajustados à demonstração. O SHA-256 do par é `90299bc4de20a8e3ddca16e42699aeafd860f945211c836d489ab5b079876421`.

Em uma nova chamada do planejador para o mesmo briefing, a revisão `f69ee2d562fd2c1e2344dfc2b255ca8604133212320f4e948a09fdad1b32cbdb` escolheu a matriz na lâmina 2. As cinco lâminas passaram na primeira renderização, com a área do quadro em 21,91% da lâmina e cobertura de 20% na coleção. O juiz preferiu a geração nas duas ordens, atribuiu 5/5 a arte–mensagem em ambas e registrou hierarquia em 5 e 4. O SHA-256 desse par é `c60831fcfec6679296460c82d9d34f9752643a283379ca9efb937c805d379074`. O comparativo cobre um briefing público de desenvolvimento.

O relatório de promoção passou a exigir parecer de coleção ligado ao briefing, ao plano, à folha de contato, aos JPEGs e às observações de novidade. A bancada mede cobertura a partir da área da mídia no recibo do renderer e calcula DDR com mídia inédita e ganho informacional verificado. O piso de DDR é aplicado às coleções `editorial_art`. Pontuações anteriores seguem disponíveis para diagnóstico. [Parecer de coleção](../../scripts/evals/carrossel/README.md#parecer-de-coleção-cobertura-e-ddr)

Para a geração de notas, o parecer ligado aos JPEGs e os embeddings da copy registraram CQS diagnóstico de 96,4, S_det de 100, S_col de 90,15, S_vlm de 98,6 e MIG de 0,8125. A revisão do texto alternativo encontrou uma placa descrita na capa que não aparece no JPEG e a omissão do pedido de salvar no alt final. O check em vigor conta a presença de alt. O escore fica vinculado ao caso de desenvolvimento e às limitações registradas. O SHA-256 da avaliação é `8e195d67ee2a62ea238a388f5b4d3c408eb5b37a8a3f37960cf770e692c023f5`.

O briefing longo e a marca amarelo-claro ficaram retidos na primeira geração. No briefing longo, uma citação com inicial minúscula divergia do trecho literal no corpo. A verificação continua exigindo a citação literal. Na marca clara, o extrator confundia o ponto da frase com parte de `R$ 140.` no fato. Após corrigir o extrator, o plano original passou pelo lastro e rendeu quatro lâminas sem reparo em um replay local. A bancada preservou o bloqueio original como primeira passagem. O planejador agora recebe uma instrução para conferir citações na copy final e descrever o conteúdo efetivamente composto em cada texto alternativo.

Na repetição após essa instrução, o briefing longo passou no lastro e as notas voltaram a incluir a matriz na lâmina 2. O alt da capa das notas descreveu a manchete e o alt do fechamento incluiu o pedido para salvar. As duas gerações entregaram cinco JPEGs e exigiram um reparo físico local cada. O briefing longo ainda declarou no alt do CTA um diagrama `flow` que o compositor oculta nesse arquétipo. A cobertura editorial medida foi 60% nesse caso, abaixo da faixa alvo de 65–90%. As duas novas gerações seguem como evidência de desenvolvimento.
