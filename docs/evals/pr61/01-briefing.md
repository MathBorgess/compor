# 1. Da descrição inicial ao briefing comercial

A etapa começa com a primeira descrição voluntária do projeto. Termina quando o agente consegue devolver uma síntese corrigível e a etapa de referências pode usá-la. O comprador hipotético pode ser descrito por sua necessidade e situação. O dono do negócio, o comprador e o público do post podem ser pessoas diferentes.

## Critérios fixados antes de ler as respostas

Cada dimensão vale 0 (ausente, genérica ou incorreta) ou 1 (específica e sustentada pela descrição, ou marcada como lacuna quando a descrição realmente não dá suporte). Quando houver informação suficiente, responder “desconhecido” perde o ponto. Uma hipótese só é útil se identificada como tal, ancorada no pedido e passível de correção. Aplicar a mesma regra a qualquer revisão testada.

| Dimensão | O avaliador procura |
| --- | --- |
| Objetivo | O efeito que o post pretende produzir junto ao público. |
| Oferta | O que pode ser vendido ou divulgado e ao menos uma característica específica, quando fornecida. |
| Comprador | Quem compra ou recebe, em que situação e com que necessidade relevante. Identifica oportunidades de esclarecer comprador e destinatário quando divergirem. |
| Valor | Uma ligação concreta entre característica do produto e utilidade para esse comprador. Benefício incerto permanece hipótese. |
| Como comunicar ou vender | Uma abordagem, formato, mensagem ou próxima ação compatível com o pedido. Divulgação sem venda imediata também é uma estratégia legítima. |
| Fidelidade e lacunas | Preserva os fatos declarados e as incertezas relevantes, sem inventar preço, data, prova comercial ou resultado. |

Métrica principal proposta: briefings utilizáveis divididos pelos briefings avaliáveis. Hipótese para o primeiro ensaio: pelo menos 5/6 dimensões, com oferta, comprador e fidelidade obrigatórias e nenhum fato comercial inventado. Para cada caso, registrar as seis notas e um trecho de evidência. Uma falsidade crítica reprova aquele caso mesmo que alcance a soma. Reportar cobertura separada (casos com saída observada / casos elegíveis). Na medida de produto, computar separadamente confirmações, correções factuais e ausência de resposta. A disponibilidade de uma saída e a concordância de um juiz não medem a confirmação humana.

O juiz recebe descrição de entrada e resposta final do primeiro turno, sem nome do modelo, revisão, condição ou histórico posterior. Deve indicar os fatos ausentes ou inventados, distinguir uma hipótese de uma promessa e aceitar paráfrases e lacunas justificadas. Não deve consultar a internet. Em comparação A/B, randomizar a ordem e inverter a posição em uma réplica. Calibrar com duas revisões humanas independentes em casos reservados e investigar os desacordos antes de usar o juiz para promoção.

## Passagem para a coleta de referências

A etapa 2 precisa de oferta, comprador e necessidade, valor sustentado, intenção do post, direção e restrições de fonte. A revisão dos exemplos pode registrar cada elemento como declarado, hipótese ou desconhecido e anotar a frase que o sustenta. No produto, consentimento para busca externa é verificado à parte. Ter respondido ao briefing não autoriza divulgar seu conteúdo a terceiros.

Na preparação do estúdio, a pessoa preenche oferta e público. O redutor atual espelha o público entre briefing e persona. A busca de referências do projeto recebe a ideia que vem de `projectIdea`, de uma mensagem humana anterior ou do argumento de abertura. O planejador paralelo recebe diretamente oferta, público resolvido, ação, direção e fatos. A skill de persona usada pelo chat tem a versão `persona-comprador.v1-draft`. [Preparação](../../../apps/web/app/studio-guided.tsx) · [Ideia encaminhada](../../../apps/web/lib/studio-project-idea.ts) · [Contexto do planejador](../../../apps/web/lib/parallel-exploration-context.ts) · [Instruções da persona](../../../packages/agents-api/src/studio-persona-skill.mjs)

## Baseline observada em 17/11/2026

**Preparação e transferência no PR.** Na revisão `8817f57`, executamos as funções reais `createStudioState`, `updateBrief`, `studioProjectIdea` e `parallelExplorationContext` em dois projetos novos sintéticos, uma mentoria e uma ferramenta de embalagens. Cada um tem uma oferta com características e uma descrição do comprador com necessidade. Não havia mensagens anteriores nem contexto herdado. Simulamos somente as leituras de feedback, com listas vazias. Os resultados são determinísticos nesse cenário.

| Observação | Casos / elegíveis |
| --- | --- |
| Oferta declarada preservada no plano | 2/2 |
| Público declarado preservado no plano | 2/2 |
| Ideia não vazia disponível para a sugestão da busca do projeto | 0/2 |
| Campo estruturado de necessidade da persona preenchido só por responder à preparação | 0/2 |

A necessidade aparecia no texto livre do público em ambos os casos, preservado no plano. O campo específico `persona.need` ficou vazio. O resultado 0/2 da busca mede a disponibilidade do texto naquela passagem. A pessoa ainda pode digitar sua busca. Uma mensagem humana anterior ou uma ideia herdada pode preencher a sugestão. Esses resultados justificam um caso de regressão da passagem do briefing para a busca.

**Julgamento LLM sobre respostas preservadas.** O mesmo caso da mentoria e o caso da ferramenta têm descrições iniciais sintéticas e respostas textuais reais arquivadas nos ensaios do protótipo MCP. Foram selecionadas antes da leitura duas execuções completas por caso, uma por modelo na mesma condição histórica E1. O script embaralha a identidade por hash, fornece uma chave neutra por resposta e omite modelo e configuração no pacote do juiz. Um subagente Codex leu esses quatro textos em uma passada e aplicou as dimensões acima. Este é um ensaio de avaliação sobre o protótipo. Para a qualidade semântica do agente **web** do PR, a cobertura de saídas gerenciadas é **0/2 casos** e a taxa é **desconhecida**. Situar a métrica do protótipo como taxa do estúdio falsearia a comparação.

| ID cego | Objetivo | Oferta | Comprador | Valor | Como | Fidelidade | Resultado e evidência observada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `1917c537bee7` | 1 | 1 | 1 | 1 | 1 | 1 | Utilizável. Identifica o profissional que quer organizar o primeiro curso, cita as duas características da mentoria e registra que preço e data estão “em definição”. |
| `1e69a469b1a3` | 1 | 1 | 1 | 1 | 1 | 0 | Incompleto. Preserva quatro encontros e revisão, sugere convite por mensagem e menciona lançamento em preparação. A síntese não identifica os dois dados comerciais que a criadora declarou em aberto. Nenhum preço ou data foi inventado. |
| `98e20f411f11` | 1 | 1 | 1 | 1 | 1 | 1 | Utilizável. Liga a consulta de recipientes ainda com clientes à rotina do pequeno produtor, identifica a hipótese criativa, propõe demonstração e registra os três limites comerciais. |
| `b2afaded9dcb` | 1 | 1 | 1 | 1 | 1 | 1 | Utilizável. Articula público, utilidade e convite a demonstração, preserva limites e deixa o destino do convite em aberto. |

Sob a hipótese de sucesso proposta, **3/4** respostas são utilizáveis no ensaio histórico. Foram quatro respostas para **dois** briefings, com **um** juiz e **zero** confirmações humanas observadas. Essa amostra serve para validar o instrumento. A divergência sobre explicitar preço/data é um bom primeiro caso para calibração humana. O resultado não permite estimar satisfação, conversão ou desempenho da revisão web.

Para repetir a extração a partir de `apps/web` com as dependências web instaladas:

```sh
node --import tsx ../../scripts/evals/pr61/briefing/baseline.mjs
node --import tsx ../../scripts/evals/pr61/briefing/baseline.mjs --judge
```

Na próxima comparação, manter a saída atual do estúdio e a saída candidata para os mesmos casos em um conjunto reservado, sob a mesma configuração. Incluir descrições escassas, venda B2B com comprador diferente do destinatário e posts sem CTA comercial. O próximo juiz recebe só os dados autorizados do caso e a resposta a avaliar. A promoção depende de evidência de compreensão e fidelidade, e o sinal humano permanece separado.


## Avaliação agrupada de 18/11/2026

O ensaio usa cinco projetos sintéticos. Três orientam mudanças (mentoria, piloto de software e encontro comunitário). Dois ficam reservados até a análise final (audioguia e vale-oficina). A unidade é um primeiro turno de um projeto. A cada rodada reconstruímos o estado pelo redutor do estúdio e obtemos o plano pelo código do repositório. Cada caso envia a instrução de persona vigente, o plano e a mensagem a uma nova sessão efêmera do Codex CLI autenticada com ChatGPT. O executor verifica o identificador da sessão, a ausência de ferramentas no turno e o texto devolvido. É uma aproximação da habilidade textual. O ensaio não executa o agente gerenciado, suas ferramentas de escrita ou a confirmação da pessoa.

O juiz recebe o texto do pedido, a resposta, o contexto local efetivamente entregue ao planejador e a rubrica fixa de seis dimensões. Identificadores aleatórios e ordem embaralhada ocultam revisão e conjunto. Calculamos casos aprovados / cinco, pontos / 30 e a presença de oferta, público, ação e ideia no plano / cinco. Preço, data, benefício ou condição comercial inventados reprovam o caso. Os critérios individuais de 5/6 e as três dimensões obrigatórias acima valem em todas as rodadas.

O conjunto foi congelado em `dbc5718`. SHA-256 do conteúdo serializado dos casos: `c0e75da08d12bb319e49c673eec8305d973a317d088d89a4cb0c77b3aae21434`. O executor e os cinco pedidos estão em [briefing](../../../scripts/evals/pr61/briefing/).

### Parecer por caso e decisão

| Caso | Base | Ciclo 1 | Ciclo 2 | Ciclo 3 |
| --- | ---: | ---: | ---: | ---: |
| B1 · mentoria para escolas | 6 | 6 | 5* | 6 |
| B2 · registro de potes em piloto | 6 | 6 | 6 | 6 |
| B3 · encontro aberto de gravura | 5* | 6 | 6 | 4* |
| B4 · audioguia, reservado | 5* | 6 | 5* | 6 |
| B5 · vale-oficina, reservado | 6 | 6 | 6 | 6 |
| **Pontos / 30** | **28** | **30** | **28** | **28** |
| **Aprovados / 5** | **3** | **5** | **3** | **4** |
| **Tema presente no plano / 5** | **0** | **0** | **5** | **5** |

O asterisco indica reprovação individual. Oferta, público e ação declarados chegaram ao plano em 5/5 em todas as rodadas. Na base, B3 inventou a possibilidade de apenas observar e um aviso futuro. Entre os reservados, B4 prometeu uma amostra de áudio. Usamos somente o parecer dos três casos de desenvolvimento para propor mudanças. Os casos reservados permaneceram fixos, e os pareceres deles só entraram na análise após a quarta medição. As fixtures são conhecidas pelo autor. Uma avaliação prospectiva pede material de outras pessoas.

| Parecer de desenvolvimento que motivou a decisão | Mudança submetida ao próximo juiz | Resultado observado |
| --- | --- | --- |
| Base · B3 assumiu compromissos que a associação não declarou. | Ciclo 1, `d313c73`. A skill pede que compromissos operacionais sejam declarados e que condições pendentes sejam identificadas. | B3 preservou a data em aberto e evitou prometer avisos. Os cinco briefings passaram nessa rodada. |
| Ciclo 1 · o juiz apontou tema vazio nos três planos de desenvolvimento, apesar de oferta conhecida. | Ciclo 2, `e4ce13b`. A descoberta e o plano usam a oferta declarada quando faltam a ideia inicial e o pedido do post. Uma ideia ou pedido explícito continua tendo precedência. | O tema passou a chegar a 5/5 planos. A ideia original permanece vazia no estado, e o público continua em campo separado. B1 perdeu fidelidade ao tratar o solicitante como criador. |
| Ciclo 2 · B1 registrou procedência excessivamente específica para o relato. | Ciclo 3, `15ba9ed`. A skill distinguiu o solicitante da pessoa a quem a fala foi atribuída. | B1 voltou a 6/6. B3 descreveu a roda mas deixou de convidar os moradores. |

**Decisão local.** O handoff do ciclo 2 resolve as cinco lacunas observadas quanto à disponibilidade do tema. O ciclo 1 teve a melhor amostra textual, mas a mesma instrução, com tema presente na segunda rodada e respostas novas, voltou a perder fidelidade. A skill do ciclo 3 resolveu uma atribuição e perdeu outro pedido. Preservamos o código já examinado do ciclo 2 na bancada. A promoção da habilidade textual exige nova amostra em que a procedência e a ação resistam em conjunto, a execução com o agente gerenciado e revisão humana. Não há estimativa da taxa de sucesso em produção.

O conjunto contém 20 respostas, 20 identificadores distintos de sessão do gerador e 20 hashes de texto diferentes. O gerador usou o modelo padrão do Codex CLI 0.166.0, sem modelo fixado explicitamente. Cada uma das quatro rodadas recebeu um parecer de uma sessão separada de `gpt-6.2-sol` com esforço médio e zero chamadas de ferramenta. A geração e o julgamento usam modelos hospedados por meio da autenticação ChatGPT. O ensaio não mede cobrança, concordância entre juízes humanos ou satisfação. Os arquivos preservam pedido sintético, contexto, texto exato, hash e ID por execução, notas nas seis dimensões e trecho/ação de cada parecer. [Base](../../../scripts/evals/pr61/briefing/runs/r0.json) · [Ciclo 1](../../../scripts/evals/pr61/briefing/runs/r1.json) · [Ciclo 2](../../../scripts/evals/pr61/briefing/runs/r2.json) · [Ciclo 3](../../../scripts/evals/pr61/briefing/runs/r3.json)

Para reproduzir, entre em `apps/web` e execute `node --import tsx ../../scripts/evals/pr61/briefing/group.mjs /tmp/compor-briefing-novo --count 5`. A pasta de saída deve ser nova. O padrão é cinco; três ou quatro preservam os dois casos reservados e usam os primeiros um ou dois casos de desenvolvimento. Autentique o Codex CLI com ChatGPT. O executor invalida uma geração que tenha chamado ferramenta. Copie somente `blind.json` para um nome aleatório em outra pasta e encaminhe essa cópia a `python3 scripts/evals/pr61/grupos/juiz-texto.py <cópia-do-pacote>`, a partir da raiz. Use o arquivo privado para juntar os pareceres por identificador após a avaliação. No ensaio registrado, cada rodada usou os cinco casos.
