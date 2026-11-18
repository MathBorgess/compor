# Três propostas de melhoria por marco do agente

Leitura da `main` em `18d8238`, em 18/11/2026. As quinze propostas abaixo são hipóteses para revisão. O [mapa dos cinco marcos](README.md) reúne as baselines e os denominadores. A pessoa pode avançar direto ao post, voltar às referências ou pedir outra direção.

## 1. Briefing do post

O estúdio reúne oferta, público, ação pretendida, direção e fatos declarados para o planejamento. Quando encontra públicos conflitantes, pausa o pedido. Esses campos podem estar preenchidos mesmo quando a necessidade de quem recebe o post continua vaga. [Contexto efetivamente enviado](../../../apps/web/lib/parallel-exploration-context.ts)

1. Pedir ao agente que identifique o trecho que sustenta cada fato comercial. Medir quantas afirmações da síntese têm apoio no pedido.
2. Quando comprador e destinatário puderem ser pessoas diferentes, testar uma pergunta curta sobre quem precisa agir. Comparar correções de público e turnos adicionais.
3. Pedir uma síntese que ligue oferta, necessidade e ação esperada. Medir quantos briefings explicam essa ligação preservando os fatos e indicando benefícios ainda hipotéticos.

## 2. Coleta e escolha de referências

A busca Phoenix escolhe fontes a partir da ideia e dos sinais do projeto. O estúdio apresenta histórico e descoberta. A escolha da pessoa determina quais referências podem seguir para a triagem. Uma referência escolhida pode interessar pela cor, pelo objeto ou pela composição. [Busca e ordenação](../../../apps/web/lib/reference-exploration.ts) · [Tela de escolha](../../../apps/web/studio/reference-exploration.tsx)

1. Comparar a consulta atual com uma consulta focada na necessidade do destinatário. Medir quantas das quatro primeiras referências atendem ao pedido.
2. Testar um limite de sugestões visualmente semelhantes entre as quatro primeiras. Medir quantas abordagens distintas continuam pertinentes.
3. Experimentar uma pergunta focada no atributo decisivo ao selecionar ou recusar uma imagem. Medir quantos comentários identificam algo aproveitável no plano e quantas pessoas avançam ao post.

## 3. Triagem do que chega ao GPT Image

A Agents API recebe os arquivos selecionados e devolve três prompts e uma lista comum de IDs. O servidor preserva a ordem, exige os uploads escolhidos e admite a omissão de externas ou geradas. O recibo comprova a entrega do arquivo. A preservação do atributo exige olhar a arte. [Planejador](../../../packages/agents-api/src/exploration-plan-provider.mjs) · [Contrato da seleção](../../../packages/agents-api/src/visual-input-contract.mjs)

1. Explicitar para cada referência o atributo observado, a intenção declarada e o lugar onde ele deve aparecer. Julgar separadamente leitura, uso e decisão de manter ou omitir.
2. Para uma opcional retida, comparar o mesmo prompt e os mesmos demais anexos com e sem esse arquivo. Medir o atributo nos dois resultados e o custo conhecido por arte utilizável.
3. Incluir contraexemplos em que a pessoa escolhe a imagem para indicar algo a evitar. Medir quantas vezes o sinal recusado reaparece nos pixels.

## 4. Geração de três propostas e convergência

Para um pedido de exploração, o contrato valida três posições com prompts, composições e contrastes textualmente distintos. O servidor acompanha os três envios paralelos. Depois do lote completo começa a espera de 15 segundos. Duas descrições diferentes ainda podem produzir a mesma solução visual. [Contrato do plano](../../../packages/agents-api/src/exploration-plan-contract.mjs) · [Despacho](../../../apps/web/lib/exploration-batch-route.ts) · [Espera e progresso](../../../apps/web/lib/parallel-exploration-progress.ts)

1. Pedir que cada proposta justifique uma mudança concreta no foco ou no percurso de leitura. Contar os pares que o juiz distingue nos pixels e cujas duas artes atendem ao pedido.
2. Avaliar os três prompts antes do envio usando exemplos de paráfrases e de alternativas válidas. Contar os lotes redundantes admitidos e os válidos retidos.
3. Incorporar um comentário explícito sobre o que preservar e o que variar no lote seguinte. Comparar dois lotes da mesma tarefa e verificar se o ajuste pedido aparece sem perder a direção escolhida.

## 5. Geração, revisão e vontade de usar o post

O agente compõe a peça inteira com os textos literais e as referências admitidas. Em uma edição, a primeira imagem identifica a arte de origem. A revisão reúne a arte da versão e sua legenda. O histórico organiza variantes pela dimensão alterada e pela versão-base. Copiar a legenda ou baixar o PNG deixa em aberto se a pessoa quer usar a peça e como ela avalia o resultado. [Pedido de criação ou edição](../../../packages/agents-api/src/artwork-input.mjs) · [Revisão da peça](../../../apps/web/studio/studio-review.tsx) · [Linhagem de versões](../../../apps/web/lib/studio-variants.ts)

1. Conferir o texto visível na arte e a legenda contra os fatos declarados. Contar versões com preço, data ou condição inventados, ausentes ou ilegíveis.
2. Comparar a versão ajustada com sua base. Medir se o pedido de mudança foi atendido e quantas versões conservaram os elementos que a pessoa pediu para manter.
3. Oferecer por versão uma resposta voluntária como “usaria”, “ajustaria” ou “descartaria”, com motivo opcional. Reportar a distribuição entre respondentes e a cobertura entre versões vistas.

Para comparar duas alternativas, escolher um único critério por vez e usar os mesmos três a cinco casos nas duas condições. O juiz registra um trecho ou localização visual por julgamento e devolve uma mudança testável para o grupo seguinte. A reserva fica fechada durante o ajuste. A promoção depende dos critérios definidos antes da comparação e da avaliação de Matheus.
