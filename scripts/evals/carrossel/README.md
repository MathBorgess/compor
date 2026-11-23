# Bancada de qualidade de carrosséis

Esta CLI executa o renderer local e consolida evidências produzidas pelos ciclos C0 a C5. C0 registra o controle. C1 mede higiene física. C2 mede edição e fidelidade. C3 mede qualidade da coleção. C4 verifica a promoção no conjunto reservado. C5 verifica uma confirmação independente em novos briefings. Uma promoção na bancada é elegibilidade para revisão. Os resultados descrevem os casos observados.

## Execução local

O `npm run quality:unit` executa os testes offline da bancada. Use as dependências instaladas em `apps/web`, um Chromium configurado em `BROWSER_EXECUTABLE_PATH` e as fontes do estúdio. Cada caso tem um diretório próprio. Use caminhos privados fora do repo para armazenar briefings reservados, artes e relatórios.

```sh
node --test scripts/evals/carrossel/evaluate.test.mjs

node scripts/evals/carrossel/cli.mjs render \
  --case dev-amarelo-papel --first "$LAB/plano.json" --evidence "$LAB/c1"

node scripts/evals/carrossel/cli.mjs evaluate \
  --cycle 1 --evidence "$LAB/c1" --output "$LAB/c1-dev.json" \
  --compare "$LAB/c0-dev.json"
```

O plano segue o contrato `validateDeck` de `packages/carousel-renderer`. A CLI grava a primeira renderização com reparo desativado. Uma falha física reparável pode iniciar uma nova renderização determinística. Passe `--final <plano.json> --repair-reason <motivo>` para registrar uma revisão explícita. Um defeito que permanece após o reparo fica no snapshot final. Use um novo diretório para uma execução adicional.

O relatório é gravado uma vez. `--strict` retorna código de saída 2 quando faltam evidências ou um critério falha. Uma falha da execução fica registrada separadamente do resultado dos gates. O resumo padrão inclui a cobertura e os critérios.

## Evidência por caso

O integrador grava `qa-manifest.json` em `<evidence>/<caseId>/`. O manifesto tem `version: 1`, `caseId`, `mode`, `first_pass`, `final`, `repair_count` e `repairs` com `stage` e `reason`. Preserve a saída virgem também quando um estágio recusa o plano. Quando não há reparo, os dois snapshots precisam corresponder. Cada snapshot tem os campos a seguir.

| Campo | Como preencher |
| --- | --- |
| `outcome` | `delivered`, `rejected_claim`, `blocked_plan`, `failed_execution` ou `unknown`. `rejected_claim` exige evidência de que a alegação sem lastro foi recusada. |
| `artifacts` | Lista `{file, sha256}` com caminhos relativos ao caso. Inclua JPEGs sequenciais, `contact-sheet.png`, `cover-grid.png` e a folha de arte raster quando aplicável. |
| `artSheetApplicable` | `false` quando nenhuma lâmina contém arte raster, junto com `ART_PURITY: not_applicable`. A CLI de render calcula ambos. |
| `slideCount` | Quantidade de lâminas pretendida no plano. A CLI confere que há um arquivo por lâmina. |
| `inputSha256` | SHA-256 dos bytes do plano usados pelo snapshot. Na presença do Lab de capas, preserve esses bytes em `plan.json` e registre `cover-lab.json` junto dele. |
| `checks` | Objeto de IDs para `{status, evidence}`. O status usa `pass`, `fail`, `not_run`, `unknown` ou `not_applicable`. Um veredito conclusivo exige uma observação. |
| `planFailures` | IDs de gates que impediram o plano de renderizar. A CLI preserva as observações do renderer em `render-checks.json`. |
| `collectionScores` | Notas de 0–100 em `visualDelivery`, `diversity`, `progression` e `cohesion`. Cada nota exige `score` e `evidence`. |
| `judgeScores` | Notas de 0–5 em `cover`, `editorial`, `artMessage`, `hierarchy`, `rhythm`, `reentry`, `voice` e `closing`. Cada nota exige `score`, `evidence` e `evaluator`. Use `critical: true` para marcar um defeito que limita a nota a 2. |
| `migMean`, `ddr` | Medidas de 0–1, quando observadas. |

Para uma comparação cega, a raiz do manifesto pode incluir `pairwise` com `againstCycle`, `candidateFirst`, `controlFirst`, `controlManifestSha256`, `evaluator` e `evidence`. As duas ordens aceitam `first`, `second`, `tie` e `abstain`. Junte os dois votos pela identidade da mesma peça. Uma inversão que muda a preferência vira inconclusiva. O relatório conta uma unidade por briefing e exige controle e candidato ligados ao mesmo caso. O denominador da taxa contém todas as entregas elegíveis, inclusive empates e inconclusivos. Se faltar uma comparação, a taxa de promoção permanece indisponível.

Para anexar uma avaliação independente sem editar o manifesto original, grave `qa-assessments.json` no diretório do caso. Use `version: 1`, `manifestSha256` e as observações em `first_pass`, `final` ou `pairwise`. Uma avaliação pode acrescentar verificações editoriais, notas de coleção e juiz, MIG e DDR. Ela não altera a geometria observada, os arquivos ou o resultado da execução. Se os snapshots usam os mesmos bytes, forneça uma avaliação comum.

A camada física conta os sete checks definidos em `protocol.mjs` e exige cobertura de todos para publicar `S_det`. A CLI verifica os hashes dos arquivos e conserva os checks do renderer como evidência à parte. As notas de coleção e de juiz usam todas as dimensões com os pesos publicados no protocolo. `CQS = 0,25 S_det + 0,30 S_col + 0,45 S_vlm` exige as três parcelas e uma entrega visual verificada. Os vetos factuais e físicos são registrados independentemente do CQS.

### Parecer de coleção, cobertura e DDR

Associe `collectionEvidence: {file, sha256}` ao snapshot avaliado em `qa-assessments.json`. Use `collection-first-pass.json` ou `collection-final.json`. O parecer é produzido após a leitura do briefing, do plano, da folha e dos JPEGs em ordem. Cada nota observada cita de uma a vinte posições e descreve a observação. A escala usa 0–100. Use `unknown` quando faltar base para a nota e registre o motivo.

Use 0 quando a entrega daquela dimensão estiver ausente, 25 quando houver um obstáculo grave, 50 quando a entrega for parcial, 75 quando a entrega estiver clara com uma limitação concreta e 100 quando cumprir o que o briefing pede sem limitação relevante. Interpole pela extensão do efeito observado nas lâminas citadas.

| Campo | Conteúdo |
| --- | --- |
| `version`, `scope`, `mode` | `1`, `collection` e o modo do briefing e do plano. |
| `briefingSha256`, `planSha256`, `renderChecksSha256` | SHA-256 do briefing serializado por `judgeBriefing`, do plano e de `render-checks.json`. |
| `contactSheetSha256`, `deckSha256` | SHA-256 da folha e `judgeDeckHash` sobre os hashes dos JPEGs sequenciais. |
| `noveltySha256` | SHA-256 da observação ligada em `noveltyEvidence` no mesmo snapshot. Use `null` quando não houver observação ligada. |
| `reviewer` | `{method, identity}` com `human` ou `vlm` e identificação do revisor. |
| `scores` | `visualDelivery`, `diversity`, `progression` e `cohesion`. Cada entrada tem `{status, evidence, slides}` e a chave numérica `score` em `observed`. |
| `slides` | Uma observação em ordem para cada JPEG com `{id, index, sha256, visual, evidence}`. Use `novel` para uma mídia que amplia a função cognitiva da lâmina, `reused` quando reaproveita uma mídia já observada, `none` para ausência ou mídia decorativa e `unknown` quando o revisor não consegue decidir. |

Em `editorial_art`, avalie a contribuição da mídia para ler ou entender cada lâmina em `visualDelivery`. Em `diversity`, avalie se a mudança de composição serve às tarefas da coleção. Em `progression`, aponte o que se pode fazer ou distinguir a cada etapa. Em `cohesion`, cite o que mantém a leitura conectada, como eixos, alinhamento ou hierarquia.

Em `native_serial`, a tipografia pode cumprir a entrega visual. Observe em `visualDelivery` a legibilidade e a hierarquia entre identificador, instrução e detalhe. Avalie em `diversity` a diferença funcional entre as tarefas e o uso deliberado da repetição quando o formato pede pareamento. Para `progression`, descreva a ação ou critério que avança entre as notas. Para `cohesion`, confira se o alinhamento, a escala e as relações entre rótulos e notas sustentam a série. Registre mudanças observadas na ordem, nos eixos ou na função de cada lâmina.

O leitor deriva VAC da fração de lâminas com área visível de mídia ≥ 12% no recibo de render. Para DDR, o denominador contém as lâminas de conteúdo. A capa, o resumo indicado na medição de novidade e o fechamento apenas com CTA ficam fora. Um fechamento demonstrativo entra pela demonstração. Cada lâmina conta como entrega dupla se o parecer observou mídia inédita com área ≥ 12% e a evidência de novidade vinculada mediu ganho ≥ 0,70. Um denominador sem observação completa mantém DDR indisponível. Uma série nativa com lâminas de conteúdo e sem mídia tem DDR igual a zero e `applicable: false` para o piso editorial.

O relatório marca `collectionEvidence.status` como `verified` quando as quatro notas estão observadas e valida a proveniência mesmo quando há dimensão desconhecida. Os valores antigos permanecem visíveis em `collectionEvidence.legacy`, com status `unavailable` na ausência de parecer vinculado. Um parecer incompleto conserva suas lacunas no cálculo. Execute a CLI `evaluate` para os casos com pareceres ligados. Os testes do leitor usam arquivos locais.

```sh
node --test scripts/evals/carrossel/collection-review.test.mjs scripts/evals/carrossel/evaluate.test.mjs
```

### Revisão de texto na arte raster

Para cada snapshot com raster, anexe `artPurityEvidence: {file, sha256}` em `qa-assessments.json`. Salve o parecer como `art-purity-first-pass.json` ou `art-purity-final.json` no diretório do caso. Use uma avaliação comum se os snapshots forem iguais. O parecer usa os seguintes campos.

| Campo | Conteúdo |
| --- | --- |
| `version`, `scope` | `1` e `raster-text`. Inspeção dos recortes da arte raster exibidos em `art-sheet.jpg`, antes das camadas de texto e scrim. |
| `planSha256`, `artSheetSha256`, `renderChecksSha256` | SHA-256 do plano, da folha de arte e do recibo `render-checks.json` do mesmo snapshot. |
| `reviewer` | `{method, identity}`. Use `human`, `local_detector` ou `vlm`. Identifique a pessoa ou a versão do método. |
| `observations` | Uma observação por recorte do recibo com `{slideIndex, slideId, embeddedSha256, verdict, evidence, findings}`. Use `pass`, `fail` ou `unknown`. Se a resolução ou a fonte impedir uma decisão, registre `unknown`. |
| `findings` | Vazio para `pass` e `unknown`. Para `fail`, forneça regiões com `{code: "TEXT_IN_ART_LAYER", box: {left, top, right, bottom}}`. As coordenadas são de 0 a 1, relativas ao recorte da folha. |

O leitor confere a identidade de cada lâmina e o hash do raster incorporado. Um `TEXT_IN_ART_LAYER` localizado é veto mesmo quando o CQS é alto. A promoção de uma entrega raster exige parecer conclusivo vinculado. O `ART_PURITY` histórico permanece disponível para diagnóstico. Este parecer descreve a inspeção de texto na folha. Autorização de seleção, procedência, sobreposição com faces e qualidade editorial da imagem têm evidências próprias.

### Faces e pontos focais

Salve `art-focus-first-pass.json` ou `art-focus-final.json` no diretório do caso e anexe `artFocusEvidence: {file, sha256}` ao snapshot em `qa-assessments.json`. O parecer usa `version: 1`, `scope: "raster-focus"`, `planSha256`, `artSheetSha256`, `renderChecksSha256` e `reviewer: {method, identity}`, seguindo a mesma vinculação da revisão de texto.

Cada recorte precisa de uma observação com `{slideIndex, slideId, embeddedSha256, verdict, evidence, faces, focalPoints}`. Use `complete` quando a inspeção foi conclusiva e `unknown` quando faltou visibilidade ou evidência. Em `faces` e `focalPoints`, cada caixa `{left, top, right, bottom}` usa coordenadas de 0 a 1 no PNG incorporado, com origem no canto superior esquerdo. A referência espacial é o PNG inteiro, sem as margens da folha. Use listas vazias para ausência observada.

O avaliador projeta as caixas em `artPlacement.image`, recorta a área visível por `artPlacement.clip` e pelo canvas e compara com cada linha em `artPlacement.text`. A sobreposição de área positiva gera `FACE_TEXT_COLLISION` ou `FOCAL_TEXT_COLLISION`. Uma face visível dentro dos 48 px finais de S1 ou dos 48 px iniciais de S2 gera `FACE_S1_S2_SEAM`. O relatório conserva a interseção CSS e a contagem de regiões observadas, visíveis e em colisão. A colisão observada prevalece quando o restante da inspeção é parcial.

Entregas raster exigem cobertura conclusiva de foco a partir de C3. Um recibo sem posicionamento permanece avaliável para diagnóstico e deixa a cobertura de foco indisponível. O veredito geométrico usa as caixas fornecidas pelo parecer.

O FPY usa como denominador os casos de entrega previstos na suíte. O numerador conta os casos que passaram a etapa na primeira passagem. Reporte também casos com falha observada e casos indisponíveis. A recusa correta conta no desfecho esperado do caso adversarial. Ela fica fora do denominador físico. Comparações com a baseline histórica do Marco 5 podem partir dos dois carrosséis arquivados. A avaliação histórica usou outra rubrica e expôs o conjunto reservado. [Marco 5](../../../docs/evals/pr61/05-post.md)

## Lab de dez capas

Em C4 e C5, o planejador devolve as dez manchetes em `coverOptions` e a ordem em `coverRanking.order`. O prefiltro usa o teto de onze palavras e 65 grafemas e registra o alvo editorial de oito palavras. As posições originais são 1-based. O ranking inclui todas as opções dentro do teto uma vez, da melhor à pior, e `coverRanking.rationale` registra a justificativa da primeira. A manchete da primeira lâmina coincide literalmente com a primeira posição ranqueada. O plano conserva a lista original e o ranking em `coverLab.options` e `coverLab.ranking`. O Lab bloqueia listas ausentes, duplicadas ou incompletas antes da renderização.

Cada snapshot guarda as medições em `cover-lab.json` e o plano original em `plan.json`. A leitura verifica os hashes, o vínculo com o plano do snapshot e recompõe o resultado antes de contar um deck entregue na cobertura de C4 e C5. Uma primeira passagem bloqueada conserva os mesmos documentos e códigos de falha. O registro do ranking documenta a escolha editorial do planejador. A comparação cega avalia o resultado visual.

Quando `cta_closing` conclui uma demonstração exigida pelo briefing, a observação de novidade usa a manchete, os rótulos e a amostra ou os itens visíveis do diagrama. Em `category_split`, cada rótulo fica junto ao seu item, seguindo a ordem das placas. O corpo fica reservado ao CTA e o fechamento tipográfico segue excluído da medição de ganho.

## Reserva, confirmação e calibração

A suíte pública contém dez casos de desenvolvimento. Um responsável que não ajuste os candidatos fornece a suíte de reserva de seis entradas como arquivo `{version: 1, split: "holdout", cases: [...]}`, com IDs inéditos. O campo `cases` segue `dev-cases.json`. Preserve seu SHA-256 antes da execução. Faça o mesmo com seis casos inéditos de confirmação e `split: "independent"`. Preserve a reserva e a confirmação fora do repositório e do contexto do gerador. Divulgue o que o ciclo atingiu depois de congelar as revisões comparadas. [Dwork et al., estudo sobre reuso de holdout](https://arxiv.org/abs/1506.02629)

```sh
node scripts/evals/carrossel/cli.mjs evaluate \
  --cycle 0 --control-only --evidence "$LAB/c0-reserva" --output "$LAB/c0-reserva.json" \
  --holdout "$LAB/reserva.json" --holdout-sha256 "$RESERVA_SHA256"

node scripts/evals/carrossel/cli.mjs evaluate \
  --cycle 4 --evidence "$LAB/c4" --output "$LAB/c4.json" \
  --holdout "$LAB/reserva.json" --holdout-sha256 "$RESERVA_SHA256" \
  --judge-calibration "$LAB/calibracao" --calibration-sha256 "$CALIBRACAO_SHA256" \
  --compare "$LAB/c0-reserva.json" --compare "$LAB/c3-reserva.json"

node scripts/evals/carrossel/cli.mjs evaluate \
  --cycle 5 --evidence "$LAB/c5" --output "$LAB/c5.json" \
  --holdout "$LAB/reserva.json" --holdout-sha256 "$RESERVA_SHA256" \
  --independent "$LAB/confirmacao.json" --independent-sha256 "$CONFIRMACAO_SHA256" \
  --judge-calibration "$LAB/calibracao" --calibration-sha256 "$CALIBRACAO_SHA256" \
  --compare "$LAB/c4-confirmacao.json"
```

Para produzir o controle do C5, use C4 com `--control-only` e a suíte `--independent` correspondente. Compare as duas versões sob o mesmo briefing, cegue revisão e autoria, e repita a avaliação com a ordem invertida. A amostra de seis mede regressões nos casos selecionados. [Zheng et al., análise de vieses em juízes](https://arxiv.org/abs/2306.05685) · [NIST, intervalos de proporção](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm)

### Controle integral C0

O C0 usa o checkout privado e limpo de `720628ebc4c32b41ab8fdc0c1b1a4f8f62511a79`. Esse era o caminho com as skills v4 e imagens integrais usado no caso Traço Claro. O executor legado chama esse braço de `candidate`. O primeiro PNG ancora as lâminas seguintes. O C0 usa quatro lâminas quando a suíte não fixa a contagem e respeita `exactSlideCount` quando presente. Casos com recusa esperada ficam fora do pareamento de entrega. [Registro do C0 de desenvolvimento](../../../docs/design/2026-11-22-carrossel-qualidade.md#execuções-observadas-em-22112026)

`runIntegralControl` em `integral-control.mjs` recebe `root`, `baselineCheckout`, `suitePath`, `suiteSha256` e `caseId`. A opção `preflightOnly: true` verifica a seleção e informa o teto exato de uma sessão de planejamento e uma requisição de imagem por lâmina. O custo real depende dos recibos do provedor. Na execução autorizada, a função usa a chave mantida pelo processo chamador. Um resultado incerto retém `paid-active.json`. Consulte o ledger e os recibos preservados em `integral-raw/<caseId>/round-0/` antes de qualquer nova submissão.

Para um controle de desenvolvimento, passe `split: 'dev'`, o `suiteSha256` congelado de `scripts/evals/carrossel/dev-cases.json` e um `caseId` público com `expected: 'deliver_deck'`. Omita `suitePath`. O recibo e o manifesto registram `split: 'dev'`. Avalie `<root>/c0` com `evaluate --cycle 0 --control-only` e somente a suíte de desenvolvimento padrão. O fluxo padrão `split: 'holdout'` continua recebendo a suíte selada em `suitePath`.

O executor guarda os PNGs e a legenda original, incluindo sua quebra final, e deriva JPEGs 4:5 e as folhas da bancada. O verificador C0 recalcula a derivação e confere os hashes dos PNGs nos recibos, a fixture, a revisão, o briefing e a sessão de planejamento. O envelope registra a ausência de uma camada separada de arte. A comparação cega usa os JPEGs derivados e a legenda original. Atribua checks, FPY e CQS apenas às etapas para as quais houver observação direta. Use a saída `<root>/c0` como `--evidence` no comando C0 acima e forneça `--candidate-sha256` com o valor `candidateSha256` da pré-verificação.

### Calibração do juiz visual

Separe de seis a trinta pares para a calibração. Inclua ao menos dois pares sem defeitos críticos e dois com defeito crítico. Use revisão humana independente ou uma revisão independente pela rubrica com casos deliberadamente válidos e defeitos plantados. Congele o SHA-256 de `reference-labels.json` antes dos julgamentos. Mantenha a intenção do controle e os rótulos fora do contexto do juiz. O arquivo privado documenta a revisão com `{version: 1, split: "judge-calibration", reference: {kind, reviewerId, source}, cases}`. Use `human` ou `independent_rubric` em `kind`. Identifique o responsável e registre em `source` a origem verificável dos rótulos e dos defeitos.

Em um caso sintético com `category_split` e associações já definidas no briefing, use `diagram-preflight` antes de congelar os rótulos. O arquivo privado tem `{version: 1, cases}`. Cada caso tem `id` e `sides`, com `A`, `B` ou ambos. Cada lado contém `plan: {file, sha256}` e `slides`. Cada entrada em `slides` contém `slideId`, `decision: {slot, quote}` e dois pares `panels: [{label, item}, {label, item}]`. Use `headline` ou `body` em `slot` e cite o trecho literal que ensina a decisão. Preencha os pares a partir da regra do briefing e vincule o plano pelo hash do JSON do renderer. Guarde esse arquivo fora do contexto do juiz.

```sh
node scripts/evals/carrossel/cli.mjs diagram-preflight \
  --bundle "$LAB/diagram-preflight.json" --bundle-sha256 "$DIAGRAMAS_SHA256"
```

O comando verifica a associação de cada rótulo ao exemplo. A ordem das duas placas pode mudar. Uma lâmina sem expectativa fica `unchecked`. Para plantar uma associação errada, declare `--expect-mismatch caso:B:lamina` para aquele lado e ID de lâmina. A saída registra `expected_mismatch` apenas quando encontra a divergência declarada e preserva a presença da regra na cópia. A pré-verificação cobre associações explícitas. A revisão cega das imagens continua responsável por colocação, efeito visual e ambiguidades. Confira também os controles compartilhados em ambos os lados e a legibilidade das mesmas miniaturas que o juiz recebe.

O juiz recebe a segunda lâmina isolada, a capa, o recorte 3:4 e a folha em ordem de leitura. A folha usa miniaturas de 272 × 340 px e intervalos de 8 px. Para confrontar leituras independentes antes do congelamento, compare a relação entre briefing e pixels de cada lado, inclusive nas lâminas compartilhadas. Registre a evidência de desacordo em arte, ritmo, veredito ou severidade antes de reconciliar as notas.

| Campo de cada caso | Conteúdo |
| --- | --- |
| `id`, `briefing`, `facts` | Identificador inédito, briefing sintético e lista de fatos. Use `judgeBriefing(caso)` como texto de entrada do juiz. |
| `winner`, `reason` | Preferência de referência canônica `baseline`, `candidate` ou `tie` e evidência observável. |
| `baseline`, `candidate` | Cada lado contém `deckSha256`, `captionSha256`, `scores` e `criticalDefects`. O hash do deck usa `judgeDeckHash` sobre a lista ordenada de hashes dos JPEGs. O hash da legenda usa seus bytes UTF-8 ou os de uma string vazia. |
| `scores`, `criticalDefects` | Oito notas de referência de 0 a 5 nas dimensões do juiz. Para cada defeito crítico, indique `{slide, dimension, evidence}` e limite a nota da dimensão a 2. |

Execute `runBlindCarouselPair` duas vezes por caso com os mesmos JPEGs, legendas e briefing. Cada chamada julga A/B e B/A em sessões próprias. Preserve os pares e seus recibos lado a lado. Em `observations.json`, registre `{version: 1, truthSha256, cases}`. Cada entrada de `cases` tem `{id, pairs}`, com dois pares de `{file, sha256}`. Um caso só conta como concordante se os quatro votos coincidirem com o veredito de referência.

Para usar o executor da CLI, coloque em `<id>/baseline/` e `<id>/candidate/` os arquivos `slide-01.jpg` até a última lâmina e `legenda.txt` em UTF-8. Uma legenda vazia usa um arquivo vazio. A pré-verificação confere o SHA-256 dos rótulos, a sequência e os hashes dos JPEGs e legendas, os recibos existentes e o total de sessões novas no teto selecionado.

```sh
node scripts/evals/carrossel/cli.mjs calibration-run \
  --bundle "$LAB/calibracao" --truth-sha256 "$ROTULOS_SHA256" --max-new-pairs 1
```

Acrescente `--execute` quando houver autorização de uso e `OPENAI_API_KEY` estiver disponível no ambiente. O teto vale por invocação e cada par novo pode abrir duas sessões. Use `--execute --max-new-pairs 0` para materializar observações de recibos já concluídos. Os nomes dos pares são `<id>-r1` e `<id>-r2`. Para IDs acima de 77 caracteres, o nome usa `cal-<SHA-256 do id>` no lugar do id. O executor reaproveita pares verificados e interrompe diante de evidência parcial ou incerta. Reconcilie o recibo antes de qualquer nova submissão. O arquivo `observations.json` é gravado uma vez quando houver dois pares válidos para todos os casos.

```sh
node scripts/evals/carrossel/cli.mjs calibrate \
  --bundle "$LAB/calibracao" --truth-sha256 "$ROTULOS_SHA256"
```

O relatório `judge-calibration.json` exige pelo menos 80% dos casos concordantes, zero faltas ou falsos positivos para defeitos críticos e, por dimensão, erro absoluto médio de até 0,75 ponto e desvio-padrão de repetição abaixo de 0,35 ponto. O desvio compara as duas sessões na mesma ordem para cada lado. O relatório registra divergências de preferência entre ordens. Os limiares operacionais medem essa amostra. A independência da revisão e o congelamento anterior dependem do responsável que fornece os arquivos.

Para promover C4 e C5, a CLI confere o SHA-256 do relatório, recalcula as medidas e recusa a reutilização de IDs, briefings ou coleções da avaliação. Em cada `qa-assessments.json`, ligue `final.judgeEvidence` a `{file, sha256, side}`, com `side` igual a `baseline` ou `candidate`. O leitor deriva as oito notas dos dois pareceres e aplica o teto crítico à média. Nas entradas de `pairwise`, inclua `judgeEvidence: {file, sha256}` e use `judgeModel` como `evaluator`. Coloque o arquivo `*.pair.json` e seus recibos das ordens no diretório do caso. Os votos precisam corresponder às duas ordens, e o conjunto de JPEGs e a legenda precisam coincidir com os artefatos do controle e da candidata.

## Runner com serviços pagos

O preflight simulado roda com chave de teste e transporte injetado. Verifica o bloqueio antes da rede em caso de caminho, partição ou hash incorretos, a gravação do recibo, o reuso do caso e o envio de um único briefing.

```sh
node --test scripts/evals/carrossel/live.test.mjs
```

`runLiveCarousel` em `live.mjs` recebe `key` do processo que já a mantém em memória. Passe `root` como caminho absoluto privado, fora do repositório. Uma execução seleciona um `caseId` ou `caseIndex` e chama a Agents API gerenciada uma vez. C1 e C3 podem solicitar uma arte de capa (`generateCover: true`). O runner grava o plano e o recibo como arquivos irmãos de `<root>/cN/<caseId>/`. O recibo contém modelo, identificadores e contagem de uso quando informada pelo provedor. Um resultado desconhecido mantém `paid-active.json` e bloqueia outro envio naquele `root` até reconciliação do recibo. `render: false` guarda o plano para a CLI de renderização local.

O recibo registra `planner.planSha256` para o plano original antes do raster. Quando o plano chega ao renderer, `renderInputSha256` cobre os bytes do primeiro snapshot. A leitura de C1 em diante na reserva verifica os dois vínculos e exige o recibo do renderer para entregas renderizadas. Os checks físicos e os hashes dos JPEGs do snapshot precisam coincidir com as observações por lâmina. É possível examinar relatórios diagnósticos anteriores. Uma entrega selada só conta para a promoção quando esses vínculos estão presentes.

Um replay com dois planos registra `stage: "plan"` quando os hashes de entrada são distintos. Um replay com os mesmos bytes e um ajuste físico registra `stage: "render"`. O FPY usa o snapshot original, e um reparo exige um segundo snapshot distinto.

O lote experimental de rasters de `editorial_art` está disponível em C3+ com `artBatch: {maxImages}`. O teto aceita de 2 a 6 imagens, incluindo a âncora de capa, e exige `generateCover: true`. O planejador fornece `artDirection`, com médium e iluminação governados e pranchas ligadas por ID às lâminas. O runner deriva a paleta do plano, fixa a restrição de texto e exige alterações declaradas em três dos quatro eixos em relação à prancha anterior. A checagem é estrutural e a variedade percebida e a ausência de letras continuam no parecer visual.

Uma geração sem referência produz S1. As edições seguintes usam somente o raster S1 em multipart como referência de estilo, em ondas de até duas chamadas. O pedido orienta o provedor a conservar médium, paleta, luz e textura e a compor a cena nova. O recibo registra o SHA-256 da fonte e dos bytes de transporte. Quando a fonte excede 2 MiB, o runner reduz uma cópia para respeitar o contrato do adaptador. Cada PNG confirmado fica em `<root>/cN/<caseId>.art/`, com hash e recibo da prancha. Uma incerteza conserva a trava do runner e permite que a onda já enviada termine. Um erro confirmado encerra o lote e libera a trava. A revisão selada congela também o teto raster do ciclo.

O comando a seguir pré-verifica um caso sintético público, o teto e o diretório. A pré-verificação funciona sem credencial e sem chamada ao provedor.

```sh
node scripts/evals/carrossel/cli.mjs art-batch \
  --cycle 3 --case dev-amarelo-papel --evidence "$LAB/lote-c3" --max-images 4 --no-render
```

Acrescente `--execute` quando o lote já estiver autorizado e `OPENAI_API_KEY` estiver disponível no ambiente. `--no-render` conserva o plano com os rasters para renderizar depois. Com Chromium configurado, omitir a opção também executa o render e gera a folha de arte. O runner atribui os rasters às lâminas antes de validar o plano e a cadência novamente. O recibo liga o SHA-256 desse plano à direção e aos arquivos emitidos.

Para casos privados, forneça somente dados sintéticos e congele a revisão em um checkout estável. Calcule `candidateSha256` com `fingerprintLiveCarouselCandidate()` antes de receber a suíte. O hash cobre os arquivos do planejador, do renderer, seus adaptadores locais, fontes e lockfile. Execute a revisão congelada em um processo novo. Registre a versão do Chromium e a configuração de execução junto da evidência.

| Execução | Opções adicionais de `runLiveCarousel` |
| --- | --- |
| Controle C3 da reserva | `cycle: 3`, `controlOnly: true`, `candidateSha256`, `sealedSuite: { path, split: 'holdout', sha256 }` |
| C4 com reserva | `cycle: 4`, `candidateSha256`, `sealedSuite: { path, split: 'holdout', sha256 }` |
| Controle C4 da confirmação | `cycle: 4`, `controlOnly: true`, `candidateSha256`, `sealedSuite: { path, split: 'independent', sha256 }` |
| C5 com confirmação | `cycle: 5`, `candidateSha256`, `sealedSuite: { path, split: 'independent', sha256 }` |

Use o mesmo `root` para os três passos de modo a vincular os recibos ao primeiro hash de cada partição e revisão por ciclo. O caminho da suíte precisa resolver fora do repositório. `readSuite` valida os seis casos e o SHA-256 fornecido. O runner rejeita IDs ou textos de briefing repetidos entre as partições registradas naquele `root`. A seleção envia apenas o briefing, os fatos e as opções criativas do caso escolhido. A independência do desenho da suíte continua sendo responsabilidade de quem a prepara.

O runner produz evidência do planejamento, do render e dos artefatos que conseguiu recuperar. Para promover um ciclo, acrescente as avaliações de fatos, autonomia de S2, CTA único, pureza de arte, novidade, coleção e julgamento visual verificáveis previstas no protocolo. As comparações pareadas exigem controle e candidato do mesmo caso, nas duas ordens. O hash da revisão vincula o código executado. A aprovação depende dos resultados registrados nos manifestos e do relatório do ciclo.

O módulo `blind-judge.mjs` prepara capas recortadas, lâminas 2 isoladas e folhas de contato a partir de uma pasta de evidência privada. O juiz recebe o briefing, as legendas e os dois grupos sem identificação da revisão. As ordens usam sessões próprias e os recibos vinculam os hashes dos arquivos. Use exemplos rotulados e avaliadores independentes antes de tratar essa observação como evidência de promoção.

O planejador registra as citações em `claims`. Cada entrada localiza um trecho literal por `slideId` e `slot` e o liga a um fato enumerado pelo briefing. A legenda usa `slideId: "deck"` e `slot: "caption"`. A verificação cobre valores monetários, percentuais, multiplicadores, datas numéricas e alguns relatos de resultado em primeira pessoa. Uma referência ruim ou um resultado detectado sem fonte bloqueia o plano antes da imagem. A validação é refeita no relatório com o plano associado por SHA-256. O parecer `FACT_GROUNDING` continua exigindo verificação humana ou julgamento independente por causa de afirmações implícitas, unidades ambíguas e contexto.

Para medir novidade com insumos revisados, use `novelty --plan <plano.json> --observations <avaliação.json> --output <relatório.json>`. O JSON de observação fornece `model: "text-embedding-3-small"`, `inputSha256` do plano e uma lista `slides` com `id`, `textSha256`, `embedding`, `gain`, `cognitiveOperation` e `evidence`. O hash textual usa UTF-8 sobre manchete, corpo e itens de lista unidos por quebras de linha e processados por `stripScaffold`. O comando mantém embeddings ou julgamentos de ganho ausentes como inconclusivos e registra os pares reprovados. O comando trabalha com vetores fornecidos localmente e produz um diagnóstico.

Para ligar a observação de novidade ao julgamento de um caso, salve o JSON de observações como `novelty-first-pass.json` ou `novelty-final.json` na pasta do caso. Em `qa-assessments.json`, associe o snapshot a `noveltyEvidence: {file, sha256}`. O C2 recalcula os vetos a partir do plano, hashes da copy e vetores fornecidos. Um `migMean` declarado isoladamente permanece diagnóstico.

Nas rodadas seladas, passe também `--candidate-sha256` ao avaliar. O relatório compara briefing, partição, ciclo e revisão entre execução e recibo terminal. Comparações da reserva usam controles com evidência selada. Um manifesto de uma execução antiga, com texto ou hash distintos, fica indisponível para promoção. Esse vínculo local deve acompanhar a revisão independente das notas e das imagens.
