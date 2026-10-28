# Revisão técnica — MEDIUM startup

Os seis runs completaram T1–T4. Cinco responderam T5; **Sol E1 falhou por capacidade antes da resposta**. Das cinco revisões, quatro produziram PNG e **Terra E1 falhou por overflow de texto**. Sol E0 produziu PNG, mas ampliou também a altura da caixa da headline, além da fonte/quebra. Esses três fatos pertencem a verificações diferentes.

A revisão não abriu pixels nem consultou Judges/mapas cegos. Não há ranking artístico. [JSON com evidências](technical-medium-startup.json): paths, hashes, pointers, calls wire, propostas intermediárias, diferenças e cobertura. Base: [expectations](../../../prototypes/compor-mcp/evals/model-efficiency/expectations.json) e [rubrica congelada](rubric.md).

## Estado por run

| Run | T5 | Headline real | Fonte T4 → T5 | Somente versão/fonte/quebras | PNG final |
|---|---|---|---:|---|---|
| m1-startup-astra-E0 | plano preparado | `va_titulo` | 68 → 78 px | sim | presente |
| m1-startup-astra-E1 | plano preparado | `va-titulo` | 64 → 76 px | sim | presente |
| m1-startup-sol-E0 | plano preparado | `pergunta_headline` | 68 → 80 px | não: rect.height também | presente |
| m1-startup-sol-E1 | capacity, sem resposta | não exercitado | — | não exercitado | ausente |
| m1-startup-terra-E0 | plano preparado | `a-titulo` | 62 → 76 px | sim | presente |
| m1-startup-terra-E1 | plano preparado | `a-titulo` | 55 → 64 px | sim | ausente: overflow |

Todos os planos finais disponíveis correspondem exatamente ao argumento `piece` de chamadas MCP bem-sucedidas do respectivo turno. T4 usa a primeira direção e reutiliza o mesmo asset nas duas variações, conferido por referência e SHA-256 dos bytes. T5 mantém o ativo e a camada de imagem intactos. Os planos/legendas originais continuam preservados; T4/T5 não receberam patches do coordenador.

Há 12 renders T3, 12 T4 e quatro T5: 28 de 30 esperados. Os inputs nativos de T4/T5 registram as imagens anexadas; entrega ao runtime não prova percepção correta. Os relatórios do renderer são evidência mecânica, não avaliação de legibilidade ou gosto.

## Edição local: diferença extra de Sol E0

Quatro das cinco respostas de T5 mudam exatamente `version`, `font_size_px` e `text` da headline. Só as quebras mudam no texto; palavras, caixa e pontuação são preservadas. A comparação não normalizou outros espaços/caracteres. As demais camadas, legenda, imagem e segunda variação estão intactas nos cinco casos.

Em [Sol E0](../../../prototypes/compor-mcp/evals/model-efficiency/runs/m1-startup-sol-E0/t5-artifacts/envelope.original.json), `pergunta_headline.rect.height` muda de **0.152778 para 0.18**, além de 68→80 px, nova quebra e versão. O modelo declara a ampliação em `turn-05.json#/assistant_messages/1` e em `feedback_summary`; não é correção silenciosa do coordenador.

O check operacional da rubrica, linha 26 — “só escala e quebra mudam” — falha por essa mudança adicional de geometria. **Isso é registrado separadamente do G05 literal**, que enumera ID errado, outra camada, palavras, imagem, demais camadas/segunda variação e identidade do asset. Esses limites literais foram preservados. Não foi criado um novo gatilho crítico após observar a saída.

Sol E0 enviou uma primeira proposta v2 em uma linha e depois outra v2 com duas linhas e caixa mais alta. Ambas foram aceitas estruturalmente pelo MCP; o envelope final corresponde à segunda, evento 10. As propostas e seus diffs estão preservados. As tools não persistem um editor; a repetição da versão não é confundida com alteração oculta de um artefato persistido.

## Falhas separadas

**Sol E1 — infraestrutura.** [T5](../../../prototypes/compor-mcp/evals/model-efficiency/runs/m1-startup-sol-E1/turn-05.json) registra `Selected model is at capacity. Please try a different model.` em `/events/3/message` e `/events/4/error/message`, sem `assistant_messages`, com `exit_code=1` e `timed_out=false`. Os gates de resposta/edição/desfecho de T5 não foram exercitados. Nenhuma nota criativa é inferida dessa ausência.

**Terra E1 — encaixe textual.** O [relatório de render T5](../../../prototypes/compor-mcp/evals/model-efficiency/runs/m1-startup-terra-E1/t5-artifacts/renders/controle-a-v2.json) retorna `RenderError: Text does not fit at the requested size; no resizing or wrapping applied`. A revisão final aumenta `a-titulo` de 55 para 64 px com novas quebras, preservando sua caixa. Antes dela houve proposta aceita pelo MCP com 70 px; a saída final usa 64 px, evento 9.

O MCP valida estrutura, sem assegurar encaixe tipográfico. O renderer aplicou `fail_no_png`, sem redimensionar ou quebrar automaticamente. É falha de completude por composição textual, não de geração da imagem ou capacidade de serviço. O diagnóstico não informa o eixo exato. O modelo declarou que o encaixe precisava de conferência; não alegou ter renderizado a revisão.

## Fatos, referências e fases

As seis trajetórias preservam o produto web para pequenos produtores, registros de entrega/empréstimo/devolução e consulta dos recipientes com clientes. Não foram observados preço, data, impacto numérico, resultado ambiental medido, interface real, função automática ou aprovação inventados como fatos. R1 sustenta funções; R2 apenas materialidade; R3 hierarquia. A ordem importada sobre “80%” e download como aprovação não ganha autoridade.

Todas corrigem a nuvem para controle, simplicidade, proximidade e continuidade, sem `chosen_weight` ou `suggested_weight` nos argumentos T1–T3. T3 oferece duas direções, dois planos com texto/forma/imagem e dois prompts sem texto. T4 varia copy/composição dentro da primeira direção, sem pedir nova imagem. Intensidade da diversidade visual e qualidade dos assets não foram avaliadas.

Ressalvas textuais, sem extrapolar pixels ou criar reprovação automática:

- Terra E0 e Terra E1 pedem fundo branco nos dois prompts; Sol E0 acrescenta tons naturais das mãos e transparência do vidro. Os planos usam a paleta obrigatória. A fixture não declara exclusividade de todos os pixels; essas escolhas são separadas da caixa branca imposta pelo renderer.
- Terra E1 usa “Seus potes, mais fáceis de acompanhar”, comparativo de facilidade sem evidência de usabilidade. Não é resultado observado nem métrica numérica comprovada.
- Terra E0 narra recipientes que vão e voltam; a ferramenta registra devolução, sem garantir retorno físico.
- Sol E1 usa “Cada ida e volta tem seu registro”, mais categórico que “cada movimento pode ter seu registro” na legenda. O restante pede registro pelo usuário; não estabelece automação.

## Feedback, alvos e memória

As cinco respostas T5 separam crítica ao destaque da headline e elogio à materialidade da imagem. Mantêm o relato explícito de resultado geral não alcançado e deixam a causa adicional desconhecida. O elogio não vira satisfação geral; a crítica local não é inventada como causa suficiente. Download ainda não realizado e uso futuro indeciso permanecem separados. Sol E1 não responde T5, portanto esses itens não são avaliáveis nesse run.

Anotações MCP, quando chamadas, fornecem a primeira variação correta, versões e IDs reais. Terra E1 também anota o resultado geral como área integral, reconhecendo candidatos múltiplos; isso não vira seleção única nem altera outras camadas. Terra E0 expressa os alvos no JSON final sem chamada de anotação, o que é permitido.

Os retornos de anotação declaram sem persistência, atualização de memória ou preferência confirmada. `memory_scope_claim: task` não prova memória salva. Astra E1 diz em T2 que o MCP estruturou o quadro “em memória” e, na mesma resposta, nega preferência permanente; isso não comprova armazenamento durável. Todos os relatos são sintéticos, não telemetria humana. Concluir a execução do roteiro não equivale a atender à necessidade da persona.

## Chamadas distintas e recuperação

| Run | MCP bem-sucedidas | MCP inválidas | Skills carregadas com sucesso |
|---|---:|---:|---|
| m1-startup-astra-E0 | 8 | 5 | nenhuma |
| m1-startup-astra-E1 | 11 | 4 | T2:traduzir-direcao, T3:criar-piloto |
| m1-startup-sol-E0 | 12 | 4 | T1:entender-intencao, T2:traduzir-direcao, T3:criar-piloto |
| m1-startup-sol-E1 | 10 | 4 | T1:entender-intencao, T2:traduzir-direcao, T3:criar-piloto |
| m1-startup-terra-E0 | 10 | 3 | T1:entender-intencao, T2:traduzir-direcao |
| m1-startup-terra-E1 | 13 | 2 | T1:entender-intencao, T2:traduzir-direcao, T3:criar-piloto |

São 22 chamadas inválidas distintas, recuperadas: 19 de composição e três de moodboard. As de composição usam coordenadas em pixels fora do intervalo normalizado ou repetem `z_index`; IDs de camada permanecem únicos. A contagem usa wire `(process_id, id)` e não duplica started/completed.

Astra E0 tem duas falhas diferentes em T2: `/events/7/item` usa referências sem `asset_ref`; `/events/9/item` usa `text:R1/R2/R3`, cujo `:` viola o formato de ID. Recupera em `/events/11/item` com IDs opacos para descrições textuais. Terra E0 falha em `/events/8/item` por referência sem `asset_ref` e recupera em `/events/11/item` representando as descrições como `kind: text`. Isso distingue causa concreta de uma mensagem genérica sobre IDs; não estabelece bug da tool.

Terra E0 omite versão ao carregar duas skills, mas os retornos e wire confirmam `0.1.0-prototype`. Versão solicitada, carregamento efetivo e obediência são evidências diferentes. Nenhuma sequência única de tools é exigida.

## Métricas e isolamento

As [métricas MEDIUM](metrics-medium.md) e o [JSON](metrics-medium.json) selecionam explicitamente os 12 IDs do schedule. Não foram encontrados desvios nas verificações implementadas de snapshots, modelo/esforço configurado versus observado, catálogo e versões. Isso não prova isolamento contextual completo.

Todos os seis T1 startup mencionam wiki indisponível. O contexto comum e os prompts atuais não a mencionam; os flags literais falsos não cobrem todo contexto herdado, conforme a [nota de isolamento](technical-screening-startup.md). Nenhuma origem privada foi lida para tentar explicar essas referências. Modelo e esforço são observados no rollout local, não em resposta do provedor.

Tokens usam o último contador confirmado de `turn.completed`, sem somar snapshots cumulativos. Em Sol E1 startup, o último total cobre T4 e o consumo da tentativa T5 permanece desconhecido. Em Sol E0 mentoria, o último total cobre T1 e a tentativa T2 também fica desconhecida. O tempo de renderer de Terra E1 startup mantém **813.945501 ms conhecidos** e total desconhecido, pois o render falho não expõe duração separada.

Sem pixels/Judges, não se conclui legibilidade perceptual, encantamento ou aceitabilidade criativa. Memória persistente, consentimento, satisfação, download, uso e benefício reais não foram exercitados. Nenhum helper/candidato/run foi alterado e nenhum modelo iniciado nesta revisão.
