# Triagem técnica — convergência e revisão local T4/T5

Os cinco runs que completaram T4/T5 respeitaram o recorte estrutural pedido: duas variações com o asset da primeira direção e uma revisão que altera somente `version`, `font_size_px` e quebras de linha da headline. As palavras, a pontuação, a caixa, a legenda, a imagem e as demais camadas foram preservadas. Não houve julgamento visual, consulta aos Judges ou leitura de blind maps.

**Astra E0 não produziu resposta de T4 por indisponibilidade de capacidade.** Isso é falha de infraestrutura, não uma nota de criatividade ou descumprimento do modelo. T5 desse run não foi exercitado. A cobertura é cinco trajetórias com followups completos e uma interrompida antes de responder T4; não é “seis de seis” nem demonstração de valor para pessoas reais.

As comparações, hashes, pointers JSON, chamadas MCP, resultados de anotação e contadores de tokens estão na [evidência estruturada](technical-screening-followups.json). Este documento complementa a [triagem até T3](technical-screening-t3.md) e não altera suas evidências.

## Integridade da revisão

| Run | Headline real da primeira variação | Fonte antes → depois | Versão antes → depois | Resultado estrutural |
|---|---|---:|---|---|
| [Astra E1](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-astra-E1/turn-05.json) | `a-headline` | 52 → 36 px | `proposta-v1` → `proposta-v2` | Somente os três campos permitidos |
| [Sol E0](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-sol-E0/turn-05.json) | `a-headline` | 54 → 44 px | `v1` → `v2` | Somente os três campos permitidos |
| [Sol E1](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-sol-E1/turn-05.json) | `a-chamada` | 58 → 40 px | `v1` → `v2` | Somente os três campos permitidos |
| [Terra E0](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-terra-E0/turn-05.json) | `a-titulo` | 50 → 36 px | `2a` → `3` | Somente os três campos permitidos |
| [Terra E1](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-terra-E1/turn-05.json) | `fios-titulo` | 56 → 40 px | `v2-conhecimento` → `v3-headline` | Somente os três campos permitidos |

Cada comparação usou o `composition_plan` da **primeira** entrada de `variations` no JSON final nativo de T4 e `revision.composition_plan` no JSON final nativo de T5. Normalizaram-se apenas `CRLF`, `CR` e `LF` para um espaço na comparação da headline: não se normalizaram pontuação, caixa, acentos, tabs ou outros espaços. A diferença completa de cada plano contém exatamente três caminhos; não houve deslocamento de retângulo, troca de fonte/peso, cor, ordem ou conteúdo de outra camada.

Em T4, as duas variações usam a referência do asset da primeira direção de T3. Os hashes registrados em T3/T4/T5 são iguais, e o hash dos bytes do arquivo atual foi conferido sem decodificar seus pixels. Em T5, a própria camada de imagem — incluindo geometria e referência — é idêntica à de T4. Os cinco pares de extrações T4/T5 não aplicaram patches técnicos. As chamadas `prepare_layered_creative` de T5 contêm somente a revisão da primeira variação; não há envio de uma alteração da segunda. Isso verifica os artefatos e chamadas observados, não um editor com persistência real.

Todos os planos finais correspondem exatamente a argumentos `piece` de chamadas MCP bem-sucedidas do respectivo turno, com correspondência no wire. Os eventos abaixo são baseados em zero e contam apenas `item.completed`:

| Run | T4: planos válidos | T5: plano válido | T5: anotação MCP |
|---|---|---|---|
| [Astra E1](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-astra-E1/turn-04.json) | eventos 5 e 7 | evento 7 | evento 5 |
| [Sol E0](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-sol-E0/turn-04.json) | eventos 5 e 7 | evento 5 | Não chamada |
| [Sol E1](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-sol-E1/turn-04.json) | eventos 5 e 7 | evento 7 | evento 5 |
| [Terra E0](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-terra-E0/turn-04.json) | eventos 6 e 7 | evento 5 | Não chamada |
| [Terra E1](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-terra-E1/turn-04.json) | eventos 6 e 7 | evento 6 | evento 7 |

Em Sol E1, a mensagem inicial propôs 46 px; o plano final usa 40 px e explica explicitamente a correção para acomodar três linhas. A comparação considera a saída final efetivamente fornecida à tool. Não houve uma edição adicional oculta nem alegação de renderização dessa proposta inicial.

Terra E0 usa [`t4-artifacts-a2`](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-terra-E0/t4-artifacts-a2/report.json). O diretório anterior preserva a falha do extrator que exigia indevidamente `piece_id` distinto, apesar das versões `2a`/`2b`. A extração corrigida aceita a mesma saída nativa sem repará-la. A falha original pertence à infraestrutura e não penaliza o modelo.

## Feedback, memória e desfecho

Os cinco resumos finais separam a crítica à escala/hierarquia da headline do elogio à paleta. Todos apontam para IDs que existem na primeira variação e limitam a mudança à peça, sem promover preferência geral de marca ou produto. O JSON de evidências preserva integralmente `feedback_summary` e `outcome`, vinculados ao último item de `assistant_messages` de T5.

Astra E1 e Terra E1 preparam duas anotações MCP: alvo explícito da headline e área integral para o elogio da paleta. A área gera candidatos múltiplos, como esperado, sem ser tratada como identificação inequívoca de uma camada. Isso não bloqueia a preservação da paleta: a edição efetiva permanece na headline. Sol E1 prepara a anotação negativa no MCP e mantém o elogio da paleta separado no resumo final. Sol E0 e Terra E0 identificam o alvo e os dois aspectos no resumo, sem chamar a tool de anotação. A régua não exige uma sequência única de tools.

Nos três runs com anotação MCP, o `piece` fornecido corresponde exatamente à primeira variação revisada. Os alvos explícitos existem e as versões correspondem. `memory_scope_claim: task` é **alegação não verificada**, não prova de memória salva ou autorização. Os retornos declaram `updates_memory: false`, `creates_confirmed_preference: false` e `persists_data: false`. Em Terra E1, `edit_scope_claim: piece` não amplia o que de fato mudou: o diff continua restrito à headline. Alvo de anotação, alcance declarado e alteração executada são evidências diferentes.

Os cinco `outcome` preservam o relato sintético explícito de **tarefa ainda não concluída**, o download ainda não realizado e a ausência de uma causa adicional. A crítica localizada não é inventada como causa suficiente do resultado global. A possível obtenção do resultado após a revisão continua desconhecida. O elogio não é convertido em aprovação integral, e a possibilidade de baixar o rascunho não vira download observado.

`report-003.json.status: completed` significa que o runtime terminou os cinco turnos roteirizados. Não contradiz `task_complete/task_completed: false` no relato da persona e não deve ser contado como sucesso para uma pessoa. Todas essas falas vêm do caso sintético; não são eventos reais de usuário, autorização real, download, conversão ou evidência de satisfação. A renderização posterior pelo coordenador tampouco confirma que a revisão resolveu a necessidade.

## Falha de capacidade e cobertura

Em [Astra E0, `turn-04.json`](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-astra-E0/turn-04.json), `/events/3/message` e `/events/4/error/message` registram `Selected model is at capacity. Please try a different model.`. `assistant_messages` está vazio, `exit_code` é 1 e `timed_out` é falso. O [checkpoint](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-mentoria-astra-E0/report-002.json) registra falha da execução. Não há resposta de T4 para pontuar; T5 é não exercitado.

| Critério | Cinco completos | Astra E0 |
|---|---|---|
| Reutilização do asset em convergência | Verificada por referências e hashes | Não avaliável sem resposta T4 |
| Edição restrita e IDs reais | Verificada por diff, calls e alvos | Não exercitado |
| Escopo local e feedback separado | Preservados no texto sintético | Não avaliável |
| Não conclusão sem causa inventada | Preservada no relato sintético | Não exercitado |
| Legibilidade, encantamento e qualidade visual | Não avaliados aqui | Não avaliados |
| Memória persistente, consentimento e benefício real | Não exercitados | Não exercitados |

Os relatórios do compositor registram os 15 renders de followup como concluídos: dez variações T4 e cinco revisões T5. Esta revisão não abriu os pixels e não conclui se há texto inesperado nos assets, legibilidade ou qualidade visual. Nenhum Judge ou blind map foi consultado.

## Tokens sem dupla contagem

`usage_cli` cresce cumulativamente no mesmo chat retomado. Para os cinco completos, foi usado o último contador confirmado de T5; a soma dos deltas únicos do rollout foi conferida contra esse contador. **Não se somaram os cinco snapshots cumulativos de `usage_cli`.** `cached_input_tokens` é subconjunto da entrada e `reasoning_output_tokens` é subconjunto da saída; não foram adicionados novamente.

| Run completo | Total confirmado até T5: entrada + saída | Incremento observado apenas T4 + T5 |
|---|---:|---:|
| Astra E1 | 293.975 | 185.047 |
| Sol E0 | 250.713 | 144.039 |
| Sol E1 | 356.554 | 209.078 |
| Terra E0 | 269.974 | 135.819 |
| Terra E1 | 386.164 | 175.254 |

Em Astra E0, o último total confirmado continua sendo **106.391 tokens até T3**. A tentativa falha de T4 tem `usage_cli: null`; o delta do rollout é zero porque o contador anterior permaneceu igual. Isso não prova consumo ou cobrança zero para a tentativa falha: esse consumo permanece desconhecido nesta evidência. Os números acima são observações do runtime, não cobrança medida, nota de qualidade ou recomendação de modelo.
