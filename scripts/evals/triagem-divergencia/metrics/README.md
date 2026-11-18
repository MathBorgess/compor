# Métricas da ablação da referência opcional

A unidade de análise é um briefing em uma revisão congelada. Os três slots de cada braço são variações do mesmo pedido. Um ganho de fidelidade usa a escala 0–2 por atributo nos pixels. Uma arte utilizável requer um parecer explícito da rubrica. Vontade de publicar exige uma resposta humana e fica fora dessa medida.

## Insumos e verificação

Para saber se a troca do anexo explica uma diferença, forneça a `verifyPairedInputs(selection, optionalId, withSlots, withoutSlots)` a lista congelada de referências `{id,inputOrigin,sha256}` e as três entradas por braço. Cada entrada de envio contém o hash SHA-256 do prompt final, o hash da configuração comum e a lista de arquivos enviada ao fornecedor, em ordem.

```js
{ promptSha256, settingsSha256, delivered: [{id, sha256}] }
```

O hash de configuração identifica modelo, qualidade, dimensões, quantidade de saídas e demais opções comparáveis do pedido. A rota usada é registrada com o recibo. Se a remoção deixar o conjunto sem imagens e mudar de edição para geração, indique a mudança de rota ao interpretar o par. Um trabalho que usa planejamento independente em cada braço mede o efeito do fluxo inteiro. A retirada isolada de um arquivo pede o mesmo prompt e a mesma configuração nos dois braços. Para esse recorte, guarde a validação de cada posição. Um contraste não realizado, uma diferença adicional ou recibos ausentes devem ficar explícitos na interpretação.

`estimateImageCost(usage, rateCard, observedModel)` lê o uso bruto da resposta Images. A tabela congelada deve ter `currency: "USD"`, `endpoint: "images"`, `tier: "standard"`, `model`, `version` e `usdPerMillion: {inputText,inputImage,outputImage}`. Registre a fonte e a data da tabela no manifesto do ensaio. O modelo observado deve coincidir e os totais devem fechar. Uso parcial, modelo divergente ou cache tarifado ficam com custo desconhecido. O resultado é uma estimativa do consumo em dólares. Infraestrutura, juros, impostos e fatura ficam fora.

## Agregação

Chame `summarizeAblation(cases, observations, sharedPlanCosts)` **uma vez por revisão**. O roster congelado contém `{id,split,referenceCount,attributeIds}` para cada caso. `referenceCount` é N no braço completo. Os mesmos IDs de atributos são avaliados nos dois braços. A identidade da referência opcional e o atributo que motivou a escolha persistem na rubrica, inclusive para julgar se esse atributo sobreviveu quando o arquivo foi omitido.

Cada observação tem `{caseId, arm, planCostUsd, slots}`. O braço é `with` ou `without`. Os slots seguem a ordem das propostas, com `{position, state, imageCostUsd, usable, fidelity}`. Os estados admitidos são `complete`, `not-submitted`, `failed` e `unknown`. Atribua `not-submitted` somente quando houver registro de que o envio não ocorreu. Um caso ausente conserva seus três slots no denominador. Use `null` para um veredito ou custo indisponível. A fidelidade é o mapa dos IDs congelados para 0, 1, 2 ou `null`.

O custo do GPT Image por arte utilizável divide o custo de **todas** as tentativas pelo número de artes utilizáveis, incluindo o gasto conhecido em saídas rejeitadas e falhas. O cálculo de ponta a ponta acrescenta os planos. O custo de um plano iniciado separadamente em cada braço entra em seu próprio registro. Se os braços compartilharam um único plano, passe o custo uma vez em `sharedPlanCosts[caseId]`. Metade é alocada a cada braço. Se esse custo for desconhecido, inclua o ID com valor `null`. Sem artes utilizáveis, com cobrança desconhecida ou com veredito de usabilidade pendente, o quociente correspondente fica `null`. Os subtotais conhecidos continuam visíveis.

A diferença pareada de fidelidade compara os mesmos slots e atributos, no sentido **com menos sem**. O relatório mostra coberturas por caso e atributo. A média principal sobre o conjunto todo pesa os casos igualmente e exige todos os matches previstos. A média da parte observável registra sua cobertura. O resultado inclui recortes por reserva/desenvolvimento e por N. O agregado numérico sozinho não verifica o envio dos arquivos ou a cegueira do juiz.

Para executar os testes determinísticos da métrica:

```sh
node --test scripts/evals/triagem-divergencia/metrics/metrics.test.mjs
```

## Relatório de uma rodada real

A CLI lê o protocolo, o SQLite em modo de leitura, cada `plan.json`, as revisões de divergência e triagem, os recibos das imagens e os PNGs efetivos. Quando disponíveis, os pareceres de `pixels/judgments.json` são vinculados por caso, braço, posição e hash da arte. As notas 0–2 de intenção, característica e aplicação vêm de `triage-judgment.json`. Uma leitura declarada pelo agente é contada separadamente. O relatório calcula as proporções em dólares para a API Images direta em tarifa Standard, usando a tabela congelada em 18/11/2026. Na data da consulta os preços de texto de entrada, imagem de entrada e imagem de saída eram US$ 5, US$ 8 e US$ 30 por milhão, os mesmos do cenário histórico de 04/11/2026. As estimativas excluem a fatura, planos com preço indeterminado e o trabalho dos juízes. [Modelo e preços](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare) · [Tabela Standard](https://developers.openai.com/api/docs/pricing)

```sh
node scripts/evals/triagem-divergencia/metrics/report.mjs /caminho/do/ensaio 0
node scripts/evals/triagem-divergencia/metrics/report.mjs /caminho/do/ensaio 5 --include-holdout
node --test scripts/evals/triagem-divergencia/metrics/*.test.mjs
```

A saída JSON segue para stdout. Por padrão só traz os casos de desenvolvimento. Para abrir a reserva, o último candidato e o hash do feedback que o originou precisam estar congelados. O consumo da quota é global e inclui solicitações recusadas ou com desfecho incerto. Nos ciclos sem pixels previstos, `scheduledPixels` é falso e `aggregate` é nulo. Em ciclos de imagens, `aggregate` traz os denominadores originais, os subtotais conhecidos e a comparação por caso, N e divisão. `byOptionalOrigin` estratifica o custo e a fidelidade pela origem do único arquivo removido. `bySplitNOriginArm` agrupa as características avaliadas por fonte e quantidade escolhida. `trials` detalha os vereditos de divergência do plano e os pares distinguíveis e utilizáveis nos pixels. Vereditos faltantes e ausências de arte continuam explícitos. A CLI permite medir rodadas em andamento. Gravações simultâneas que ainda divergem do snapshot provocam erro e admitem nova leitura.
