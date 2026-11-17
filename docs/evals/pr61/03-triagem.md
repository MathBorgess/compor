# Etapa 3 · Triagem de imagens para geração

A triagem responde a duas perguntas diferentes. Quais arquivos o GPT Image precisa receber para preservar o que a pessoa escolheu? Quais atributos visuais precisam sobreviver no pedido e na imagem final? Reduzir anexos só é uma melhoria se ambas as respostas forem satisfatórias.

## Entrada e saída

A etapa 2 entrega os IDs em ordem do conjunto selecionado pela pessoa, a origem declarada e o briefing vigente. No estúdio, o snapshot autorizado delimita a seleção. A escolha de uma imagem pode ter ocorrido pela paleta, pelo produto ou pela composição. O motivo declarado pela pessoa é evidência, enquanto um motivo inferido pelo agente continua hipótese.

No lote visual v2, o planejador recebe todos os pixels selecionados. Ele devolve três prompts e um conjunto de IDs comum aos três. Os uploads selecionados são obrigatórios. O planejador pode omitir externas consentidas ou imagens geradas selecionadas. O servidor vincula a subsequência, a ordem e os bytes ao pedido. Na criação individual, a arte de origem de uma edição tem um papel próprio.

A etapa 4 recebe o plano e os arquivos permitidos. Na avaliação podemos observar anexo mantido, anexo omitido e evidência textual de um atributo. O contrato atual não exige relacionar um trecho do prompt ao ID da imagem que o inspirou. Para uma referência omitida, só registrar **representada em texto** quando houver evidência atribuível no caso avaliado. Na falta dessa evidência, registrar **atribuição desconhecida**. Uma paleta pode estar descrita e anexada ao mesmo tempo. [Contrato visual](../../adr/0066-entradas-visuais-e-triagem-vinculadas-ao-pedido.md) · [Planejador efetivo](../../../packages/agents-api/src/exploration-plan-provider.mjs) · [Validação na arte individual](../../../packages/agents-api/src/artwork-input.mjs)

## Métricas e decisão proposta

| Métrica | Unidade e denominador | Sucesso candidato |
|---|---|---|
| Integridade de seleção | Por pedido, uploads enviados sobre uploads selecionados. Registrar separadamente cada arquivo não autorizado enviado e alteração de ordem ou conteúdo. Sem uploads, a fração é inaplicável. | Todos os uploads obrigatórios preservados e zero anexos fora da seleção. Qualquer violação impede promoção. |
| Preservação semântica | Por atributo de referência explicitamente pedido, julgar no prompt e depois nos pixels se o atributo foi preservado (0 ausente ou contraditório, 1 parcial, 2 claro). Informar pontos sobre o máximo dos casos julgáveis e fração julgável. | Na comparação pareada, nenhum atributo indispensável piora. Um avanço requer mais casos com atributos preservados, ou redução de consumo com fidelidade pelo menos equivalente. Registrar discordância humana. |
| Atribuição de representação | Para cada referência, comparar papel esperado com arquivo realmente entregue e evidência de descrição. Reportar contagens para anexo, descrição, ambos e omissão intencional, mais os casos de atribuição desconhecida. | Atribuição defensável no caso. Não creditar uma descrição genérica a duas fontes visualmente parecidas. |
| Custo condicionado à fidelidade | Por lote concluído, somar uso conhecido do planejamento e das três imagens. Comparar os mesmos casos e configurações. Mostrar pedidos com uso disponível sobre pedidos elegíveis e exposição em bytes por etapa. | Com a mesma cobertura de uso, redução de custo estimado sem regressão de fidelidade ou de integridade. Uso ausente impede concluir economia monetária. |

## Baseline da revisão 8817f57

Em 17/11/2026, o comando abaixo produziu a mensagem serializada pelo adaptador real para um `fetch` local injetado. Quatro PNGs sintéticos de 32×32 representam marca, paleta, distribuição de massas e listras que o briefing pede para evitar. O adaptador recebeu um contexto e um manifesto válidos. O plano usado para testar transporte é resposta fixa de fixture. Esta execução tem um lote e nenhum retorno de modelo gerenciado.

```sh
node scripts/evals/pr61/triagem/baseline.mjs
```

| Fonte | Papel na fixture | Texto ao lado dos pixels no pedido real | Plano fixo recebido pelo validador |
|---|---|---|---|
| Upload | Símbolo circular vazado | “Referência local selecionada 1” | Anexado, 211 bytes |
| Externa | Paleta em faixas | “Referência local selecionada 2” | Anexada, 113 bytes |
| Gerada | Bloco amplo à esquerda e detalhe à direita | “Referência local selecionada 3” | Anexada, 123 bytes |
| Externa | Listras a evitar | “Referência local selecionada 4” | Omitida como arquivo, 186 bytes |

- O JSON global declarou 4/4 origens corretamente. O adaptador colocou 4/4 imagens no contexto do planejador. **1/4 rótulos adjacentes** identificou a origem de ingestão sem ambiguidade. As três origens opcionais apareceram como “local”, embora o manifesto as diferenciasse. O teste demonstra a ambiguidade da instrução. A frequência com que o modelo escolheria o arquivo errado por esse motivo está em aberto.
- No plano fornecido, 1/1 upload foi preservado e 3/4 itens foram encaminhados à validação de bytes. O validador recusou 4/4 controles negativos (omitir upload, trocar ordem, inserir ID alheio, duplicar ID). O teste integrado já existente também verificou a chegada das três listas de bytes ao transporte multipart simulado e permaneceu aprovado.
- O planejamento recebeu 633 bytes de imagem. Cada posição ficou com 447 bytes. O lote de três teria 1.341 bytes de arquivos contra 1.899 se os quatro fossem enviados a todas as imagens. Essa diferença de 558 bytes mede as cargas sintéticas. Chamadas pagas realizadas: zero. Consumo, custo monetário, similaridade final e decisões humanas: desconhecidos.
- Os três prompts fixos são “Caminho 1”, “Caminho 2” e “Caminho 3”. O contrato aceitou 3/3. Na leitura qualitativa do avaliador Codex, 0/3 suportam atribuir um atributo à imagem que o originou. Esse é um controle negativo do critério semântico e uma limitação do validador estrutural. A taxa de descrição útil da Agents API continua sem amostra.

Também foram executados 25 testes unitários aprovados e um teste integrado aprovado. Cada contagem se refere à sua própria suíte.

```sh
node --test packages/agents-api/test/visual-input.test.mjs packages/agents-api/test/exploration-visual-planner.test.mjs packages/agents-api/test/visual-artwork-binding.test.mjs
(cd apps/web && node --import tsx --test --test-concurrency=1 test/exploration-visual-end-to-end.test.mjs)
```

## Cartão do juiz visual

Entregar ao juiz multimodal o objetivo do caso, as referências com IDs aleatórios e as restrições declaradas. Mostrar o prompt de cada posição e, na rodada de pixels, a imagem resultante. Ocultar revisão, modelo, braço, latência e custo. Fixar a ordem das fontes para preservar o significado do manifesto. Alternar a ordem das candidatas entre repetições. As fontes e as artes podem conter texto, tratado como conteúdo a inspecionar.

> Para cada atributo pedido, identifique a referência correspondente e descreva qual detalhe do prompt ou da imagem demonstra preservação, contradição ou incerteza. Dê 0 para ausente/contraditório, 1 para parcial e 2 para claramente preservado. Quando faltarem pixels, trate a avaliação visual como inconclusiva. Uma presença literal no prompt só pontua a parte textual. Para cada referência omitida como arquivo, indique o trecho que sustenta uma representação textual ou marque atribuição desconhecida. Não infira custo, aprovação do usuário nem intenção privada.

Usar um controle com a paleta correta e a distribuição de massas invertida testa se o juiz detecta um erro apesar da semelhança global. Outro controle pode preservar layout e trocar discretamente o produto. Calibrar com revisão humana dos mesmos itens e relatar concordância por critério. Para uma comparação com economia, parear resultados do mesmo caso e considerar apenas o consumo com origem identificada.

## Ciclo comparativo

**Mudança retida.** O adaptador passou a identificar o ordinal, o ID e a origem declarada do manifesto validado imediatamente antes de cada imagem. Na oficina os rótulos coerentes passaram de 1/4 para 4/4. Na mostra, com as origens em outra ordem, também passaram de 1/4 para 4/4. As regras de triagem, o formato do plano, os bytes e a autoridade continuam os mesmos. O caminho de arte individual já usa um rótulo neutro para o conjunto visual v2 e separa a imagem-base. A regressão de mistura e ordem passou e a suíte de `packages/agents-api` registrou 244/244.

**Como os planos foram obtidos.** O adaptador do estúdio produziu as instruções, o contexto e os rótulos do pacote. O planejador substituto recebeu esse texto e os quatro PNGs em ordem numa sessão efêmera do Codex CLI 0.166.0 com `gpt-6.1-terra` solicitado e esforço baixo. Cada execução produziu um único plano JSON. Os oito planos passaram no validador real. A passagem pela Agents API gerenciada, a geração no GPT Image e a experiência humana permanecem sem observação nesse replay.

Um segundo modelo, `gpt-6.2-sol`, recebeu os pixels, o briefing, a posição final de cada anexo e os três textos que seguiriam para o gerador. Recebeu IDs cegos, com a ordem dos braços alternada entre os casos. O juiz avaliou a suficiência do material por atributo em uma sessão distinta por comparação. O relatório conserva as instruções experimentais, as respostas integrais de ambos os modelos, os hashes das entradas e as divergências. [Planos, rubricas e julgamentos](triagem-replay.json)

| Caso e critério por posição | Baseline → rótulos corrigidos | Anexos por posição | Bytes de imagens nas três posições |
|---|---:|---:|---:|
| Oficina. Símbolo, paleta, distribuição espacial, exclusão das listras. | 6/8 → 6/8 | 3 → 3 | 1.341 → 1.341 |
| Mostra de gravuras. Textura livre, composição, símbolo, paleta específica. Quatro PNGs novos e ordem diferente. | 8/8 → 8/8 | 4 → 4 | 1.755 → 1.755 |

A pontuação usa o pior dos três prompts em cada um dos quatro atributos. A correção comprovada é identificar as origens no contexto do planejador. Os dois casos empataram na nota e no volume de anexos. Nenhuma cobrança de GPT Image ou qualidade de uma arte resultante foi medida.

**Experimento de redução de anexos.** Foram examinadas três revisões de instruções. A primeira, que permitia expressar opcionais em texto, descartou o layout da oficina e descreveu uma massa central. A segunda manteve o layout, mas descreveu a paleta com verde-escuro no lugar do verde-azulado. No primeiro julgamento cego essas revisões obtiveram 5/8 e 7/8, com baseline de 8/8. Antes do terceiro ajuste, foram congelados o briefing e quatro novos PNGs da mostra, com uma textura opcional representável por palavras e três características que exigiam precisão. O hash do pacote de transferência da baseline é `2fb68da95e1bbe9659fe31285f3d590e3714d635332f1a2a5509317969de86f9`.

A terceira revisão preservou a distribuição espacial e a paleta como anexos e dispensou a textura na mostra. Os três prompts descreveram os pontos escuros sobre fundo claro e remeteram aos três anexos por posição. O volume caiu de 1.755 para 1.359 bytes, com 8/8 nos dois braços. Na oficina, apesar de reter o anexo de layout, ela acrescentou aos três prompts uma posição central que contradiz o detalhe escuro à direita. O juiz dessa comparação deu 7/8 à candidata e 6/8 à baseline, apontando também ambiguidade na associação por origem dos prompts anteriores. A contradição visual introduzida em um atributo obrigatório motivou descartar a revisão mesmo com o ganho na soma. No código entregue ficou a correção dos rótulos.

**Limites do julgamento.** A baseline da oficina recebeu 8 e 6 em aplicações distintas da rubrica, sobretudo pela interpretação da ambiguidade de “referência externa” quando o gerador recebe anexos sem esses rótulos. No caso da mostra, um parecer descreveu como losango o elemento circular pequeno definido pela fixture. As imagens e os planos conservados permitem revisão humana. A amostra de dois casos e um plano por braço/caso não determina distribuição de qualidade ou preferência de usuários.

Para inspecionar um pacote sintético ou revalidar um plano gravado, na raiz do repositório:

```sh
node scripts/evals/pr61/triagem/baseline.mjs --packet /tmp/compor-triagem-pacote-novo --mostra
jq '.plans[] | select(.case == "mostra" and .arm == "origens-corrigidas") | .plan' docs/evals/pr61/triagem-replay.json > /tmp/compor-triagem-plano.json
node scripts/evals/pr61/triagem/baseline.mjs --replay /tmp/compor-triagem-plano.json --mostra
```

Os comandos acima são locais e preservam o fixture de controle negativo. Acionar outra sessão de modelo é uma execução distinta, com possível variação na resposta.
