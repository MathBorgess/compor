# Revisão técnica — startup LOW, T1–T5

Os seis runs completaram os turnos nativos. Todos preservaram as palavras da headline, o ativo e as demais camadas em T5. Cinco produziram PNG final; **Sol E1 falhou no encaixe do texto e não produziu PNG em T5**. Esta revisão não inspecionou pixels nem consultou Judges/mapas cegos, e não indica vencedor artístico.

Base: [expectations](../../../prototypes/compor-mcp/evals/model-efficiency/expectations.json), [rubrica](rubric.md) e evidências por run no [JSON desta revisão](technical-screening-startup.json). Paths, hashes, JSON Pointers e linhas wire estão registrados no JSON.

## Edição local e artefatos

| Run | Headline real | Escala T4 → T5 | Versão | Render final |
|---|---|---:|---|---|
| r1-startup-astra-E1 | `a-titulo` | 62 → 76 px | proposta-v1 → proposta-v2 | [rendered](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-startup-astra-E1/t5-artifacts/renders/presenca-a-revisao-2.json) |
| r1-startup-sol-E0 | `va-titulo` | 60 → 76 px | v1 → v2 | [rendered](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-startup-sol-E0/t5-artifacts/renders/rev-va-headline-v2.json) |
| r1-startup-terra-E1 | `va-titulo` | 50 → 64 px | proposta-1 → proposta-2 | [rendered](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-startup-terra-E1/t5-artifacts/renders/variacao-a-revisao-1.json) |
| r1-startup-astra-E0 | `a-titulo` | 72 → 82 px | v1 → v2 | [rendered](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-startup-astra-E0/t5-artifacts/renders/vdp-controle-var-a-v2.json) |
| r1-startup-sol-E1 | `vp-headline` | 68 → 78 px | v1 → v2 | [failed](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-startup-sol-E1/t5-artifacts/renders/vdp-var-pergunta-v2.json) |
| r1-startup-terra-E0 | `a-titulo` | 55 → 61 px | 2a → 3a | [rendered](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-startup-terra-E0/t5-artifacts/renders/ciclo-a-revisao-3a.json) |

A comparação estrutural encontrou exatamente três mudanças em cada revisão: versão da peça, `font_size_px` e quebras explícitas de uma única headline. Só as quebras foram normalizadas para verificar as palavras; caixa, pontuação e demais caracteres foram preservados. Geometria, fonte, cores, imagem e demais camadas permaneceram idênticas. A legenda também ficou intacta. T5 não reemitiu nem alterou a segunda variação.

As cinco chamadas `prepare_annotation_context` apontam para a peça/version de T4 e IDs reais de headline e imagem. Astra E0 respondeu com os alvos no resumo, sem chamada de anotação — a sequência de tools não era obrigatória. `memory_scope_claim` é `task`; nos dois Terra, `edit_scope_claim` é `piece`, enquanto o alvo segue a camada correta. Não há promoção permanente observada.

Em T4, as duas variações de cada run usam o ativo da primeira direção, com identidade e bytes conferidos por SHA-256. Em T5, o mesmo ativo continua intacto. Os envelopes finais correspondem exatamente a `piece` de chamadas MCP bem-sucedidas, conferidas novamente nos eventos `item.completed` e no wire. Associações técnicas de asset ausente em T3 estão registradas, sem alteração de copy/geometria; T4/T5 não receberam patches.

Há 12 renders em T3, 12 em T4 e cinco em T5: 29 de 30 artefatos esperados. Os inputs nativos de T4/T5 registram as imagens anexadas; isso comprova entrega ao runtime, não percepção correta pelo modelo.

## Falha de Sol E1 e atribuição

O [relatório de T5](../../../prototypes/compor-mcp/evals/model-efficiency/runs/r1-startup-sol-E1/t5-artifacts/renders/vdp-var-pergunta-v2.json) retorna `RenderError: Text does not fit at the requested size; no resizing or wrapping applied`. A headline `vp-headline` mudou de 68 para 78 px e a quebra passou de `Seus potes estão / com quais clientes?` para `Seus potes / estão com quais clientes?`, mantendo a mesma caixa. O diagnóstico não especifica o eixo do overflow.

O plano passou na validação estrutural MCP, mas falhou no contrato de encaixe do renderer. O renderer preservou a política `fail_no_png`; não reduziu fonte nem fez quebra automática. A falha pertence à composição textual solicitada pelo candidato, detectada pelo renderer; não há evidência de falha da geração de imagem ou indisponibilidade de infraestrutura neste ponto. O candidato declarou que o encaixe ainda precisava ser conferido, sem alegar render final concluído. A revisão local passa; a entrega completa não.

## Fatos, referências e feedback

As seis trajetórias preservam as funções declaradas: registrar entrega, empréstimo e devolução; consultar recipientes com clientes. Não foi observada invenção de preço, data pública, métrica de impacto, depoimento, resultado ambiental medido, automação ou interface real. R1 continua descrição funcional; R2 limita-se à materialidade fosca/papel; R3 serve à hierarquia. O comando importado de R2 não foi promovido a autoridade.

Todas corrigem a nuvem para controle, simplicidade, proximidade e continuidade. Não há `chosen_weight` numérico inventado. Terra E0 apresentou pesos sugeridos em T1, identificados como `suggested_weight`; a nuvem final de T2 fica sem pesos humanos atribuídos. Os planos de texto/forma usam a paleta obrigatória e 1080×1080. Os prompts pedem assets sem texto; a ausência de texto nos pixels não foi avaliada aqui.

T3 apresenta duas abordagens conceituais descritas, enquanto T4 converge na primeira com variações de copy/composição. A revisão reconhece essa mudança de fase; não exige um novo conceito em T4. Intensidade e qualidade da diversidade visual continuam sem pontuação.

Duas ressalvas semânticas merecem leitura editorial: Terra E0 usa “mais fácil de acompanhar”, uma facilidade comparativa não demonstrada pelo caso; Sol E0 narra “Depois, volta”, que descreve o ciclo, mas não comprova nem garante retorno físico. Não transformar essas frases em resultados observados. A revisão não as converte automaticamente em métricas falsas ou garantias explícitas.

Em T5, todos separam a crítica negativa à headline do elogio à materialidade da imagem, registram que o resultado geral ainda não foi alcançado e deixam a causa adicional desconhecida. Download não foi realizado segundo a fixture; eventual uso e satisfação com a revisão ficam desconhecidos. A conclusão de execução do runtime não equivale à conclusão da tarefa pela persona. Essas falas não são eventos reais de usuário.

## Chamadas e recuperação

| Run | MCP bem-sucedidas | MCP falhas distintas | Skills carregadas com sucesso |
|---|---:|---:|---|
| r1-startup-astra-E1 | 11 | 4 | T1:entender-intencao, T3:traduzir-direcao, T3:criar-piloto |
| r1-startup-sol-E0 | 12 | 5 | T2:entender-intencao, T3:explorar-moodboards, T3:criar-piloto |
| r1-startup-terra-E1 | 12 | 4 | T1:entender-intencao, T2:traduzir-direcao, T3:criar-piloto |
| r1-startup-astra-E0 | 5 | 4 | nenhuma |
| r1-startup-sol-E1 | 12 | 4 | T1:entender-intencao, T2:traduzir-direcao, T3:explorar-moodboards, T3:criar-piloto |
| r1-startup-terra-E0 | 9 | 3 | nenhuma |

São 24 chamadas inválidas distintas, todas recuperadas antes dos planos finais: 22 de composição (coordenadas em pixels fora do intervalo normalizado e, em parte, `z_index` repetido) e duas de moodboard. A contagem usa wire `(process_id, id)` e não duplica `item.started`/`item.completed`.

As duas falhas de moodboard são Sol E0 T2 `/events/11/item` e Terra E0 T2 `/events/6/item`: IDs distintos, `kind=reference` sem `asset_ref`. O código congelado da tool exige a equivalência entre referência e presença de `asset_ref` (`mcp-snapshot/dist/server.js:121`). Ambos recuperam declarando IDs opacos para as referências textuais, sem alegar arquivos reais. A mensagem agregada “IDs devem ser únicos e apenas referências devem ter asset_ref” é pouco específica, mas não estabelece bug do validador. Em métricas, `tool_error` é categoria genérica de erro retornado, não atribuição de defeito à tool.

## Limitação de isolamento

Os T1 de `m1-mentoria-astra-E1` e `m1-mentoria-sol-E0` mencionam que a wiki externa não está disponível no escopo autorizado. Nem seus prompts correntes nem `common-context.md` mencionam wiki. Esses dois runs MEDIUM são diagnósticos adicionais e **não entram nas métricas LOW**. Menções semelhantes existem nos LOW startup Astra E0 e Terra E0/E1.

Os relatórios mostram os três marcadores de isolamento como `false`. Isso tem alcance limitado: `runtime/runner.py:170` busca literais em mensagens `developer/system`; não pesquisa o conteúdo de `base_instructions`, que recebe apenas hash, nem mensagens `user`. O catálogo completo de ferramentas do pedido ao provedor também não é exposto. Portanto, os flags não demonstram ausência de política ou contexto herdado.

Os probes documentam um Sol inicial inválido com catálogo automático pessoal e dois probes nativos bem-sucedidos de conectividade. Não explicam as referências atuais à wiki nem constituem teste exaustivo de isolamento. A origem dessas menções permanece não resolvida: pode ser contexto/instrução herdada ou inferência do modelo. Não há prova aqui de consulta à wiki ou exposição de segredo. **Não declarar ambiente totalmente isolado.** Nenhum arquivo de autenticação, instrução privada bruta ou rollout privado foi consultado para investigar isso.

## Métricas e limites

Use [metrics-low-v2](metrics-low-v2.md) e seu [JSON](metrics-low-v2.json). A primeira tentativa [metrics-low](metrics-low.json) foi preservada. A correção torna desconhecido o total de renderer de Sol E1 startup, pois o render falho não expõe duração separada; mantém 1028.365917 ms conhecidos dos renders anteriores. A regressão foi coberta; 22 testes passaram. Nenhum candidato, run ou helper congelado foi alterado para corrigir o relatório.

Tokens são o último contador confirmado de `turn.completed`, com deltas auditáveis; não foram somados contadores cumulativos. Modelo/effort são observações do runtime local. Sem notas de Judges, custo faturado, inferência pura, aprovação humana ou conclusão de qualidade global. Legibilidade perceptual e ausência de texto indevido nos assets exigem inspeção visual separada.
