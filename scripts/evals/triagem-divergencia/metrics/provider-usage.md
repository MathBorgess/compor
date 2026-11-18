# Custos observáveis por recibo do ensaio

O adendo usa os modelos, modalidades e contagens de tokens dos recibos já reservados. A data da tabela é **18/11/2026**, com valores em USD por um milhão de tokens na tarifa Standard global. Cada resultado identifica as operações cobertas, valores faltantes, subtotais e as hipóteses da estimativa. A fatura da organização é outra fonte.

| Modelo | Entrada | Leitura de cache | Escrita de cache | Saída |
| --- | ---: | ---: | ---: | ---: |
| GPT-6.1 Terra, contexto curto | 1,00 | 0,05 | 1,25 por 30 min ou 2,50 por 12 h | 5,00 |
| GPT-Image-2.6 Flare, texto | 5,00 | 1,25 | — | — |
| GPT-Image-2.6 Flare, imagem | 8,00 | 2,00 | — | 30,00 |

O Agents API cobra o modelo utilizado. Ferramentas da OpenAI têm preços próprios, e um sandbox hospedado pode gerar custo de contêiner. O planejador congelado especifica GPT-6.1 Terra, zero ferramentas, subagentes desativados e ambiente `none`. A consulta suplementar confere essa configuração na sessão antes de usar sua medição. Imagens recebidas pelo Terra participam de seus tokens de entrada. A API de sessões documenta contagens agregadas de entrada/saída, leitura de cache e raciocínio. A separação texto/imagem das entradas do Terra e o número de escritas de cache ficam sem medição nesse recurso. O desconto de Flex/Batch, outras velocidades, janelas de processamento em segundo plano, sobretaxas regionais e condições particulares de conta ficam fora da hipótese Standard. Os juízes em sessões separadas também ficam fora desta medição. [Preços do Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra) · [Cobrança de ferramentas e ambiente](https://developers.openai.com/api/docs/guides/agents-api/overview) · [Observabilidade dos agentes](https://developers.openai.com/api/docs/guides/agents-api/observability)

### Custos do planejamento

O cálculo conta os tokens de raciocínio dentro da saída e os tokens recuperados do cache dentro da entrada. Cada token de entrada recebe uma tarifa: comum, leitura ou escrita. Quando o cache lido é conhecido, o limite inferior usa tarifa comum para os tokens restantes e o superior simula escritas até o máximo permitido pela validade conhecida. Sem o total lido de cache, o limite inferior admite que toda a entrada tenha obtido desconto. Com validade desconhecida, o limite superior inclui o preço da escrita de 12 horas. Esses extremos são cenários de preço de tabela condicionados às contagens registradas. [Regras de cache](https://developers.openai.com/api/docs/guides/prompt-caching)

O limiar de 272 mil tokens vale por chamada do modelo. Um turno gerenciado pode envolver várias chamadas. Se a soma do turno for inferior ou igual a esse limiar, todas cabem no contexto curto. Acima do limiar, o adendo mostra limites que admitem contextos curtos ou longos. Na hipótese longa, o valor de entrada e de cache dobra e a saída custa 1,5 vez a tarifa curta. Contagens ainda parciais podem mudar. [Contexto longo e preços do modelo](https://developers.openai.com/api/docs/models/gpt-6.1-terra)

### Custos de imagens

A resposta de cada geração/edição contém o uso disponível para aquela arte. O cálculo concilia entrada total com suas parcelas de texto e imagem e separa o componente de saída. As tarifas cheias de entrada são o cenário usado no relatório da bancada. O guia atribui expressamente a GPT-Image-2 e GPT-Image-2.5 a exclusão de desconto de cache na Images API direta. A página do Flare 2.6 lista tarifas com cache para as duas modalidades. Quando o recibo desta versão omite o detalhamento de cache, o adendo inclui um cenário conservador que admite desconto, ao lado do cenário de entrada cheia. Sem tokens de saída observados, esse componente fica desconhecido. A API recebe PNG com uma imagem por pedido e qualidade automática, portanto preço fixo por arte seria inadequado. [Tarifas do Flare 2.6](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare) · [Geração de imagens, custos e limitações do cache](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency)

## Usar o adendo

```sh
node scripts/evals/triagem-divergencia/metrics/provider-usage.mjs DIRETORIO_DO_ENSAIO 0
node scripts/evals/triagem-divergencia/metrics/provider-usage.mjs DIRETORIO_DO_ENSAIO all
node --test scripts/evals/triagem-divergencia/metrics/provider-usage.test.mjs
```

O modo padrão lê o SQLite em um snapshot de leitura. A saída JSON contém as contagens sanitizadas e um registro para cada operação reservada, inclusive resultados incertos. O orçamento remanescente continua no relatório da rodada. A soma de subtotais de entrada e saída é informativa quando a cobertura é parcial. O intervalo monetário de todas as operações exige cobertura integral. `lowerForCoveredOperationsUsd` e `upperForCoveredOperationsUsd` somam apenas as operações com limites completos. `knownOutputOperations` e `knownInputOperations` informam a cobertura dos componentes. `modelCostRangeUsd` é uma estimativa do grupo reservado até a data indicada.

O parâmetro opcional `--refresh-stdin` recebe uma credencial por pipe e consulta apenas os recursos dos IDs que já constam do SQLite da rodada indicada. Para um turno conhecido, faz `GET /v1/agents/sessions/{sid}` e `GET /v1/agents/sessions/{sid}/turns/{turnId}`. Na ausência do ID do turno, consulta `GET /v1/agents/sessions/{sid}/turns?limit=2&order=desc` e usa o resultado somente se houver exatamente um turno raiz, sem paginação restante. As chamadas consultam registros existentes e não iniciam sessões, turnos ou imagens. Respostas 401, 403 e 429 suspendem as leituras restantes na mesma invocação.

As contagens da sessão e do turno podem se sobrepor ou mudar com a contabilização. O adendo escolhe uma observação e registra divergências de escopo ou de contagem. A saída em stdout permite guardar snapshots datados ao lado dos recibos, preservando os originais. [GET na sessão](https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/methods/retrieve) · [GET no turno](https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/subresources/turns/methods/retrieve) · [Lista de turnos da sessão](https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/subresources/turns/methods/list)
