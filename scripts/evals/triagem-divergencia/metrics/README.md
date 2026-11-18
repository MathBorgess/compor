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
