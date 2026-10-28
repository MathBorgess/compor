# E2 proposto — ajuda curta de contrato e composição revisável

28/10/2026 · Proposta histórica anterior à implementação. Estado atual: [E2 em desenvolvimento](e2-development.md), com contratos e trajetória completa testados; [avaliação visual abaixo da régua](e2-result.md), sem promoção.

**Recomendação:** partir do E0 congelado e acrescentar somente lembretes de coordenadas/ordem junto ao schema e um trecho curto, carregado sob demanda, em `criar-piloto`. Testar esse E2 contra aumento de esforço. Não ampliar o E1 inteiro nem recomendar promoção com base nas notas desta rodada. O resultado pretendido é menos tentativas inválidas e melhor decisão de composição dentro do pedido; não há evidência de que esta proposta consiga ambos.

## Evidência e limites da hipótese

Fontes: [triagem técnica até T3](technical-screening-t3.md), [Judge A](judge-a-round1-mentoria.md) e [Judge B](judge-b-round1-mentoria.md). Esta proposta usa os mecanismos gerais observados; não incorpora ideias, paletas, títulos ou soluções visuais desses casos. Os Judges são avaliações sintéticas, não aprovação humana. O autor desta proposta já conhece seus achados: os mesmos casos não podem servir de validação independente de E2.

- A triagem contou **26 chamadas inválidas distintas: 12 por coordenadas e 14 por `z_index` repetido**. Os seis runs recuperaram e entregaram em T3 planos correspondentes a chamadas válidas. A tool cumpriu o contrato; não há bug demonstrado que justifique relaxar validação ou apagar o custo das tentativas.
- E1 não evitou essas duas classes de erro. Isso enfraquece a hipótese de que basta adicionar explicações. Não estabelece a causa: proximidade do lembrete, carga de contexto, transformação do catálogo pelo runner, esforço e comportamento do modelo ainda precisam ser separados.
- Carregamento de skills foi observado em apenas parte dos runs. Uma skill disponível, mas não carregada, não pode explicar o resultado. O experimento deve observar uso real, sem tornar uma sequência de chamadas requisito artificial de sucesso.
- Ambos os Judges encontraram peças individuais satisfatórias, mas nenhum pacote completo passou integralmente. Apontaram limites de especificidade, integração, hierarquia e distribuição após revisão; divergências de legibilidade permanecem. Notas de um artefato não certificam a trajetória.
- Uma redução local pode cumprir exatamente o pedido e ainda deixar espaço excessivo. Não se deve atribuir essa consequência a desobediência nem mover outros elementos para recuperar uma nota.

A medição anterior do catálogo foi de 14.091 bytes em E0 e 26.953 em E1. Bytes não são tokens; antes do ensaio, conferir o payload realmente entregue pelo runner. Meta de implementação proposta: catálogo E2 de até **18.000 bytes**, no mesmo formato de medição, e trecho artístico de até **200 palavras**, carregado no máximo uma vez por versão quando necessário. São limites de engenharia candidatos, não um limiar comprovado de atenção ou qualidade.

## Mudança mínima candidata

Manter integralmente validação, callbacks, retornos, escopos, limites de autoridade e textos-base de E0. Nenhuma alteração nos braços congelados. E2 teria configuração própria do runner, nunca um novo default do produto.

| Superfície | Adição proposta | Por que neste ponto |
|---|---|---|
| `prepare_layered_creative.description` | Uma instrução curta para conferir unidade de `rect` e unicidade de `z_index` antes da chamada. | A restrição aparece junto à ação que recebe o plano, sem exigir leitura de uma skill para produzir argumentos válidos. |
| `piece.layers[].rect` e `.z_index`, inclusive em anotações | Descrições curtas e um exemplo numérico de normalização; índices em sequência como convenção para **novos** planos. | São as duas fontes concretas de chamadas inválidas. Manter a regra perto do valor reduz a distância entre orientação e preenchimento. |
| `load_skill` / catálogo de skills | Indicar `criar-piloto` para composição e revisão, sem carregar todas as skills de entrada. | Orientação artística entra na etapa pertinente; ausência de carregamento será registrada. |
| `criar-piloto`, somente no candidato | Preservar o texto-base e acrescentar o trecho abaixo em um arquivo experimental separado, com versão/hash próprios. | Uma única skill reúne intenção, hierarquia e revisão; não cria outra ferramenta ou etapa obrigatória. |

Texto candidato para os campos técnicos:

> `rect`: frações da imagem orientada, não pixels: `x=px/W`, `y=py/H`, `width=pw/W`, `height=ph/H`; `x+width<=1` e `y+height<=1`. `font_size_px` continua em pixels. Exemplo genérico: em 800×600, caixa (80, 60, 400, 120) vira (0.1, 0.1, 0.5, 0.2).
>
> `z_index`: inteiro único em toda a peça, inclusive camadas do mesmo tipo. Em plano novo, use 0, 1, 2… na ordem de pintura; não use um índice por categoria. Na revisão, preserve a ordem existente fora do escopo autorizado.
>
> Antes de `prepare_layered_creative`, confira os retângulos e a ausência de índices repetidos. Se a tool recusar, corrija a causa indicada no plano e reenvie; não reenvie os mesmos argumentos.

Isso não exige índices contíguos na validação nem converte pixels automaticamente. IDs, valores e estado recebido continuam sendo preservados. O exemplo ensina uma operação numérica; não oferece um template de composição.

Trecho artístico candidato, sem exemplo de campanha:

> Antes de compor, defina o efeito pretendido e a relação entre mensagem, imagem e hierarquia. Dê a cada bloco uma função: entrada, compreensão ou ação; corte repetição apenas quando o pedido permitir. Uma alternativa deve mudar a ideia ou a leitura de modo útil, conforme a pessoa esteja explorando direções ou variando uma direção escolhida.
>
> Planeje a caixa da imagem considerando o encaixe e o fundo do compositor. Preserve os fatos necessários para entender a peça no contexto de uso; não dependa de legenda quando a peça precisar funcionar sozinha.
>
> Na revisão, identifique o alvo e os campos autorizados. Faça a mudança solicitada, preserve o restante e confira o efeito sobre a hierarquia. Se outra alteração ajudar, apresente-a como opção separada. Use preview e medidas somente quando realmente disponíveis; sem eles, declare o limite e não alegue ter verificado o resultado visual.

A proposta não inclui estilos preferidos, comandos para “encantar”, notas a perseguir, composição universal, nem uma lista crescente de regras derivadas de cada julgamento.

## Edição local quando o tamanho prejudica o conjunto

1. **Pedido com valor exato:** aplicar o tamanho exato, conservando texto, quebras, retângulo, demais camadas e ativos, salvo autorização diferente. Não trocar o número por uma solução esteticamente preferida. Se o contrato não permite o valor, explicar a incompatibilidade; não alegar execução.
2. **Pedido qualitativo, como reduzir dominância:** escolher uma redução compatível com o pedido dentro dos campos autorizados, sem presumir que a pessoa quer a menor fonte possível ou uma linha única. Não há redução percentual universal proposta.
3. **Verificação:** comparar valores/camadas antes e depois. Com preview real, conferir o conjunto no tamanho de uso; medidas de encaixe apenas comprovam limites geométricos. Sem preview, registrar que hierarquia e legibilidade percebidas não foram verificadas.
4. **Consequência fora do escopo:** entregar a edição local concreta e indicar brevemente o efeito observado ou risco não verificado. Recompor espaçamentos ou mover outras camadas é uma opção separada que depende de autorização. Não produzir essa alternativa por conta própria para satisfazer o Judge.

Uma autorização para alterar tamanho não inclui automaticamente texto, quebras, posição, proporção de imagem ou preferência de produto. Um resultado visual menos resolvido pode ser a consequência legítima de uma restrição. A avaliação deve preservar simultaneamente fidelidade ao pedido e qualidade observada, sem escondê-las em uma média.

## Teste proposto: esforço versus guidance

**Antes de executar:** registrar hashes do E2, catálogo visto pelo modelo, trecho carregável e contexto comum. Confirmar que descrições aninhadas sobrevivem ao adaptador e chegam ao modelo. Se o runner as remove, corrigir/registrar a infraestrutura antes da comparação; não atribuir a falha à falta de leitura do agente.

Piloto fatorial com um modelo-alvo escolhido previamente, sem escolhê-lo após ver os novos resultados:

| Célula | Guidance | Esforço solicitado |
|---|---|---|
| A | E0 congelado | low |
| B | E0 congelado | high |
| C | E2 candidato | low |
| D | E2 candidato | high |

Executar sessões novas, em ordem contrabalanceada, com os mesmos casos, contexto autorizado, limites de chamadas e tempo, fontes, renderer e disponibilidade de feedback. Duas repetições por célula permitem observar instabilidade inicial; não sustentam conclusão estatística ampla. Identidade/effort solicitados, observados no runtime e confirmados pelo provedor devem permanecer campos distintos.

Começar por composição e revisão com ativos fixos e autorizados iguais entre células, evitando misturar variação do gerador com efeito do planejador. Isso restringe a conclusão a esse trabalho; não demonstra melhoria na criação livre de conceitos ou imagens. Novos casos devem ser definidos por autor sem acesso à proposta e julgados antes de qualquer ajuste de E2. Replays dos casos já vistos servem apenas para diagnóstico/desenvolvimento. Não alterar casos, rubrica ou resultados anteriores.

Comparações: B−A estima o efeito observado de esforço em E0; C−A, o pacote E2 em low; D−B, o pacote E2 em high; D−C, esforço em E2. E2 combina descrições e skill: qualquer ganho inicial pertence ao pacote. Para atribuir ganho à skill, fazer depois uma ablação pré-registrada de E2 sem o trecho artístico, mantendo o mesmo catálogo técnico e esforço. Não inferir causalidade simplesmente comparando runs que decidiram carregar a skill com os que não carregaram.

Registrar separadamente:

- **Contrato e recuperação:** sucesso na primeira chamada, erros distintos por causa e por plano, tentativas até plano válido, validade final e completude da trajetória. Contar calls encerradas uma vez e conferir o wire; não premiar um run que evita a ferramenta e deixa de entregar o plano.
- **Qualidade e autoridade:** evidência visual cega, comparação por artefato/fase, legibilidade no tamanho de uso, utilidade das alternativas e integridade determinística da revisão local. Preservar julgamentos divergentes e resultados ausentes; não esconder uma violação de escopo atrás de nota artística alta.
- **Custo observado:** tokens de contexto, saída e uso reportado pelo runtime, cache quando disponível, latência, calls, tentativas inválidas e carregamentos de skill. Registrar moeda somente quando observada ou com método de estimativa declarado. Sem qualidade/completude equivalente, não declarar vencedor de eficiência.

Se o pacote pequeno melhorar contrato sem melhorar arte, registrar esse resultado como tal. Se high já resolver o problema, comparar o custo total antes de atribuir vantagem a E2. Só ampliar o estudo aos demais modelos depois de justificar a próxima etapa; nenhuma execução está autorizada por este documento.

## Objeção principal: texto não substitui retorno visual

E1 já continha a regra de normalização e unicidade. Reescrevê-la pode não vencer uma tendência do modelo, um problema no transporte do schema ou uma carga excessiva de planejamento. Fórmulas e preflight mental também podem ser ignorados. É preciso observar a primeira chamada efetiva, não avaliar a documentação pela aparência.

A skill pode organizar o raciocínio, mas não mede largura real de fonte, contraste percebido, integração do ativo ou espaço deixado por uma edição. O renderer detecta overflow; um render aceito ainda pode ter hierarquia fraca. Um Judge posterior não fecha esse ciclo para o agente que nunca viu o preview. Pedir “revise visualmente” sem lhe entregar pixels cria uma falsa verificação.

Se E2 falhar, a próxima hipótese pertinente é um **retorno local verificável** do renderer/preview ao agente, com o mesmo acesso em todos os braços, e não mais páginas de instruções. Isso seria outro fator experimental: comparar E2 com e sem esse retorno, a esforço fixo e com orçamento de iterações igual. Não adicioná-lo silenciosamente a E2, não mudar o compositor congelado e não propor serviço, editor ou feature de produção para testar essa hipótese.

**Decisão sugerida:** revisar este pequeno candidato e seu desenho de ensaio. Implementação isolada, execuções e eventual promoção permanecem etapas distintas; este documento não registra aprovação nem demonstra melhoria.
