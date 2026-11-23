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

O FPY usa como denominador os casos de entrega previstos na suíte. O numerador conta os casos que passaram a etapa na primeira passagem. Reporte também casos com falha observada e casos indisponíveis. A recusa correta conta no desfecho esperado do caso adversarial. Ela fica fora do denominador físico. Comparações com a baseline histórica do Marco 5 podem partir dos dois carrosséis arquivados. A avaliação histórica usou outra rubrica e expôs o conjunto reservado. [Marco 5](../../../docs/evals/pr61/05-post.md)

## Lab de dez capas

Em C4 e C5, o planejador devolve as dez manchetes em `coverOptions` e a ordem em `coverRanking.order`. O prefiltro usa o teto de onze palavras e 65 grafemas e registra o alvo editorial de oito palavras. As posições originais são 1-based. O ranking inclui todas as opções dentro do teto uma vez, da melhor à pior, e `coverRanking.rationale` registra a justificativa da primeira. A manchete da primeira lâmina coincide literalmente com a primeira posição ranqueada. O plano conserva a lista original e o ranking em `coverLab.options` e `coverLab.ranking`. O Lab bloqueia listas ausentes, duplicadas ou incompletas antes da renderização.

Cada snapshot guarda as medições em `cover-lab.json` e o plano original em `plan.json`. A leitura verifica os hashes, o vínculo com o plano do snapshot e recompõe o resultado antes de contar um deck entregue na cobertura de C4 e C5. Uma primeira passagem bloqueada conserva os mesmos documentos e códigos de falha. O registro do ranking documenta a escolha editorial do planejador. A comparação cega avalia o resultado visual.

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

### Calibração do juiz visual

Separe de seis a trinta pares para a calibração. Inclua ao menos dois pares sem defeitos críticos e dois com defeito crítico. Use revisão humana independente ou uma revisão independente pela rubrica com casos deliberadamente válidos e defeitos plantados. Congele o SHA-256 de `reference-labels.json` antes dos julgamentos. Mantenha a intenção do controle e os rótulos fora do contexto do juiz. O arquivo privado documenta a revisão com `{version: 1, split: "judge-calibration", reference: {kind, reviewerId, source}, cases}`. Use `human` ou `independent_rubric` em `kind`. Identifique o responsável e registre em `source` a origem verificável dos rótulos e dos defeitos.

| Campo de cada caso | Conteúdo |
| --- | --- |
| `id`, `briefing`, `facts` | Identificador inédito, briefing sintético e lista de fatos. Use `judgeBriefing(caso)` como texto de entrada do juiz. |
| `winner`, `reason` | Preferência de referência canônica `baseline`, `candidate` ou `tie` e evidência observável. |
| `baseline`, `candidate` | Cada lado contém `deckSha256`, `captionSha256`, `scores` e `criticalDefects`. O hash do deck usa `judgeDeckHash` sobre a lista ordenada de hashes dos JPEGs. O hash da legenda usa seus bytes UTF-8 ou os de uma string vazia. |
| `scores`, `criticalDefects` | Oito notas de referência de 0 a 5 nas dimensões do juiz. Para cada defeito crítico, indique `{slide, dimension, evidence}` e limite a nota da dimensão a 2. |

Execute `runBlindCarouselPair` duas vezes por caso com os mesmos JPEGs, legendas e briefing. Cada chamada julga A/B e B/A em sessões próprias. Preserve os pares e seus recibos lado a lado. Em `observations.json`, registre `{version: 1, truthSha256, cases}`. Cada entrada de `cases` tem `{id, pairs}`, com dois pares de `{file, sha256}`. Um caso só conta como concordante se os quatro votos coincidirem com o veredito de referência.

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

Para casos privados, forneça somente dados sintéticos e congele a revisão em um checkout estável. Calcule `candidateSha256` com `fingerprintLiveCarouselCandidate()` antes de receber a suíte. O hash cobre os arquivos do planejador, do renderer, seus adaptadores locais, fontes e lockfile. Execute a revisão congelada em um processo novo. Registre a versão do Chromium e a configuração de execução junto da evidência.

| Execução | Opções adicionais de `runLiveCarousel` |
| --- | --- |
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
