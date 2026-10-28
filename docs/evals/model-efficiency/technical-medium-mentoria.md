# Revisão técnica — MEDIUM mentoria

Cinco trajetórias completaram T1–T5 com planos MCP válidos, reuso do ativo e edição local correta. **Sol E0 falhou por capacidade antes de responder T2**; T3–T5 desse run não foram exercitados. Não houve inspeção de pixels, consulta a Judges/mapas cegos ou comparação de qualidade visual.

A [evidência JSON](technical-medium-mentoria.json) registra paths, hashes, pointers, diferenças completas e requests/responses wire. Base: [expectations](../../../prototypes/compor-mcp/evals/model-efficiency/expectations.json) e [rubrica congelada](rubric.md).

## Cobertura e revisão local

| Run | T2 | Headline da primeira variação | Escala T4 → T5 | Renders T3/T4/T5 |
|---|---|---|---:|---|
| m1-mentoria-astra-E0 | respondido | `seq-titulo` | 58 → 46 px | 2 / 2 / 1 |
| m1-mentoria-astra-E1 | respondido | `a-titulo` | 54 → 44 px | 2 / 2 / 1 |
| m1-mentoria-sol-E0 | capacity, sem resposta | não exercitado | — | — |
| m1-mentoria-sol-E1 | respondido | `tva-titulo` | 48 → 40 px | 2 / 2 / 1 |
| m1-mentoria-terra-E0 | respondido | `titulo` | 52 → 40 px | 2 / 2 / 1 |
| m1-mentoria-terra-E1 | respondido | `fios-titulo` | 52 → 40 px | 2 / 2 / 1 |

Nos cinco completos, o diff de T4 primeira variação → T5 contém exatamente `version`, `font_size_px` e `text` da headline existente. Só as quebras mudaram no texto: palavras, caixa, acentos e pontuação foram preservados. A fonte diminuiu conforme pedido; retângulo, família/peso, cor, entrelinha, alinhamento, outras camadas e legenda ficaram idênticos. A segunda variação não foi reemitida nem alterada pelas chamadas observadas.

As duas variações de T4 usam a mesma referência e os mesmos bytes SHA-256 do ativo da primeira direção de T3. T5 preserva essa referência e toda a camada de imagem. Quatro runs receberam somente a associação técnica de `asset_ref` ausente em T3, documentada e sem modificar copy/geometria; Terra E0 já o forneceu. Nenhum T4/T5 recebeu patch de plano.

Cada plano final corresponde exatamente a `piece` de chamada `prepare_layered_creative` bem-sucedida do mesmo turno. Eventos `item.completed` e wire foram reconferidos; started/completed não duplicam chamadas. Há 25 renders concluídos: dez T3, dez T4 e cinco T5. PNGs e hashes conferem; o runtime registra os renders anexados aos prompts de T4/T5. Isso não prova percepção correta do modelo nem qualidade visual.

## Autoridade, fatos e fases

Os seis T1 preservam a oferta de quatro encontros semanais ao vivo, mentoria online e revisão de um plano de aula, com preço/data em aberto e convite a pedir informações. Copy, canais e direções são apresentados como propostas. Não foi observada invenção de matrícula garantida, credencial, preço, prazo público ou resultado mensurado. Nenhuma imagem foi chamada antes da autorização T3.

Nos cinco T2 respondidos, R1 orienta voz, R2 apenas ritmo/hierarquia e R3 o tom a evitar. O comando importado de R2 é rejeitado como autoridade; a paleta ameixa/argila/creme permanece. A nuvem final é acolhimento, prática, clareza e autonomia. Não há peso numérico apresentado como escolha humana; os valores de `chosen_weight`/`suggested_weight`, quando presentes, estão discriminados no JSON. Hipóteses continuam revisáveis e locais à peça. Sol E0 não oferece resposta T2 para avaliar esses gates.

T3 contém duas direções descritas, dois planos e dois prompts de assets sem texto. T4 converge na primeira direção e varia copy/composição; não se exige nova divergência conceitual nessa fase. Não foi avaliada a intensidade visual dessas diferenças.

Ressalva observável: os dois prompts de Terra E0 pedem **“sobre fundo branco”** e citam ameixa/argila sem creme. Os planos usam todas as três cores obrigatórias. Essa escolha textual é distinta da caixa branca técnica do compositor. A fixture exige a paleta na peça, sem exclusividade explícita de todos os pixels; sem inspeção de pixels, não se declara falha visual ou gate crítico automaticamente.

## Feedback, anotações e desfecho

Todos os cinco T5 separam a crítica à escala/hierarquia da headline do elogio à paleta. Mantêm o relato explícito de tarefa não concluída, download ainda não realizado e necessidade ainda não resolvida/desconhecida. Possibilidade de baixar o rascunho não vira download observado. Nenhum motivo adicional é inventado a partir da crítica local; efeito da revisão continua não confirmado.

Astra E0 anota a headline no MCP e mantém a paleta no resumo. Astra E1 anota dois aspectos sobre a headline, explicando que o elogio de paleta abrange a peça inteira. Sol E1 usa a camada de fundo como referência para a paleta e explicita seu alcance geral na peça. Terra E1 usa área integral para a paleta, com candidatos múltiplos reconhecidos, e camada explícita para a headline. Terra E0 registra os aspectos no JSON final sem chamar a tool de anotação. Não existe roteiro único obrigatório de tools.

Todas as anotações fornecem o plano anterior correto, a versão correta e IDs reais. A ambiguidade de área de Terra E1 não vira seleção inequívoca nem amplia a edição. Os retornos declaram `updates_memory`, `creates_confirmed_preference` e `persists_data` falsos; `memory_scope_claim: task` é alegação não verificada, não prova de memória salva.

Essas falas são fixtures sintéticas. “Pessoa” e “relato explícito” nas saídas não estabelecem participante humano, satisfação real ou autorização real. `report.status: completed` significa fim do roteiro nativo, não sucesso da tarefa da persona.

## Erros e skills observados

| Run | Calls MCP bem-sucedidas | Calls MCP inválidas distintas | Skills carregadas |
|---|---:|---:|---|
| m1-mentoria-astra-E0 | 6 | 4 | nenhuma |
| m1-mentoria-astra-E1 | 6 | 4 | nenhuma |
| m1-mentoria-sol-E0 | 2 | 0 | T1:entender-intencao |
| m1-mentoria-sol-E1 | 14 | 4 | T1:entender-intencao, T2:traduzir-direcao, T3:criar-piloto, T3:explorar-moodboards |
| m1-mentoria-terra-E0 | 7 | 3 | nenhuma |
| m1-mentoria-terra-E1 | 11 | 4 | T1:entender-intencao, T3:explorar-moodboards |

São 19 chamadas inválidas distintas recuperadas: 18 de composição e uma de moodboard. Nos quatro Astra/Sol E1/Terra E1, as primeiras chamadas usam coordenadas em pixels e as seguintes repetem `z_index`; IDs de camada são distintos. Terra E0 recupera duas chamadas com coordenadas em pixels e uma de moodboard com `kind=reference` sem `asset_ref`, apesar de IDs distintos. O JSON registra os argumentos e a causa específica; a mensagem agregada da tool não deve ser lida como prova de IDs duplicados. Não há evidência de bug da tool nessas validações.

Sol E0 registra `Selected model is at capacity. Please try a different model.` em [T2](../../../prototypes/compor-mcp/evals/model-efficiency/runs/m1-mentoria-sol-E0/turn-02.json), `/events/3/message` e `/events/4/error/message`. `assistant_messages` está vazio, `exit_code=1`, `timed_out=false`. É infraestrutura; não há resposta T2 para pontuar e T3–T5 permanecem não exercitados.

## Isolamento e contadores

Todos os seis T1 mencionam wiki indisponível, embora os prompts atuais e o contexto comum não a mencionem. Os três marcadores de isolamento aparecem falsos em todos os turnos observados. Isso não demonstra ausência de política herdada: o detector pesquisa literais só em mensagens `developer/system`, enquanto `base_instructions` recebe apenas hash e mensagens `user` não entram nessa busca. A origem das menções segue não resolvida, como documentado na [revisão anterior](technical-screening-startup.md). Não se afirma isolamento total, consulta à wiki ou exposição de segredo. Nenhuma instrução privada bruta, arquivo de autenticação ou rollout privado foi lido nesta revisão.

Modelo e esforço MEDIUM foram conferidos no rollout local; o campo de modelo retornado pelo provedor é nulo. Os contadores abaixo usam o último `turn.completed` confirmado, sem somar snapshots cumulativos. Cache é subconjunto de entrada e reasoning é subconjunto de saída.

| Run | Último turno confirmado | Tokens entrada + saída acumulados | Uso da tentativa falha |
|---|---:|---:|---|
| m1-mentoria-astra-E0 | T5 | 323029 | não se aplica |
| m1-mentoria-astra-E1 | T5 | 252055 | não se aplica |
| m1-mentoria-sol-E0 | T1 | 49831 | T2 desconhecido, não zero |
| m1-mentoria-sol-E1 | T5 | 463234 | não se aplica |
| m1-mentoria-terra-E0 | T5 | 275666 | não se aplica |
| m1-mentoria-terra-E1 | T5 | 343842 | não se aplica |

Os cinco completos passaram nas verificações técnicas observadas de continuidade e edição. Isso não conclui aceitação criativa: legibilidade perceptual, encantamento, alinhamento visual e pixels dos assets permanecem fora desta revisão. Consentimento, memória persistente, download, uso e benefício reais não foram exercitados. Nenhum helper/candidato/run foi alterado e nenhum modelo novo foi iniciado.
