# E2 — candidato implementado e replay diagnóstico

28/10/2026. Continuação do objetivo após o fechamento da rodada E0/E1 no commit `aa7ff80`. Não promove o candidato nem altera os resultados dos 24 pacotes.

**Atualização:** [trajetória completa e avaliação](e2-result.md). Os registros abaixo preservam o marco inicial até T3.

## Intervenção

`COMPOR_MCP_GUIDANCE=focused_v2` parte do catálogo E0 e acrescenta orientação localizada a `rect`, `z_index`, preparação de camadas e carregamento da skill de piloto. Apenas `criar-piloto` recebe complemento de composição/revisão, com versão `0.1.0-prototype-e2` e hash próprios. As outras skills mantêm conteúdo e versão.

- Catálogo observado pelo cliente: **17.540 bytes**, abaixo da meta candidata de 18 KB; E0 tem 14.091 e E1 26.953.
- Complemento: **149 palavras**, carregado sob demanda.
- **35/35 testes MCP passaram**, incluindo quatro novos: invariância dos catálogos E0/E1, limites do E2, versão/conteúdo das skills, paridade de preparação e transporte stdio. Uma asserção antiga de mensagem de erro precisou refletir a terceira opção do host; o primeiro teste detectou a divergência e ela foi corrigida.
- Schemas de validação e callbacks de preparação preservados. E0 continua o default. O complemento orienta composição; não mede texto nem oferece preview.

## Replay real, restrito a desenvolvimento

Run: `e2-dev-mentoria-terra-low-01`. Modelo/effort observados no runtime: Terra 6.1 / low, Codex CLI nativo, mesmo caso visível de mentoria e mesmo contexto comum. Identidade retornada pelo provedor continua indisponível.

| Observação até T3 | Resultado |
|---|---|
| Catálogo recebido no wire | Igual estruturalmente ao congelado; três processos/negociações |
| Skill de piloto carregada | Uma vez, na versão E2, conteúdo/hash conferidos |
| Preparação de camadas | Dois planos reais válidos na primeira chamada de cada plano |
| Erro de tool | Um moodboard sem asset_ref, depois recuperado |
| Extração dos planos finais | Confere com chamadas MCP bem-sucedidas; aguarda ativos |
| Tempo ativo do runner | 78.064 ms aproximadamente |
| Tokens cumulativos confirmados | 147.454 entrada, 5.787 saída; 128.256 de entrada em cache (subconjunto) |

T1–T3 foram concluídos; o run está **pausado antes dos assets**. T4/T5 e qualidade visual não foram exercitados. Não somar estes contadores cumulativos a checkpoints anteriores.

A primeira tentativa de comparar hashes de serialização do catálogo encontrou ordem de chaves diferente entre wire e SDK. A verificação foi corrigida para igualdade estrutural e hash canônico; nenhum catálogo ou run foi modificado. Entrega ao cliente não prova atenção do modelo nem que a representação interna do pedido preserve todos os metadados.

## Limites e próximo passo

Uma amostra em caso conhecido não demonstra redução causal de erros, qualidade aceitável ou vantagem econômica. Não há imagens geradas, renders ou Judge deste candidato. Os resultados E0/E1 seguem sendo a única comparação completa publicada. Os limites de isolamento nativo anteriores continuam aplicáveis.

Próximo passo do objetivo: gerar os dois assets a partir dos pedidos preservados, compor e retomar este mesmo run em T4/T5, auditando edição local e avaliando pixels. Depois definir casos novos para validação independente; repetir casos conhecidos será desenvolvimento. Nenhuma aprovação foi inferida.

Evidência: [freeze anterior ao replay](../../../prototypes/compor-mcp/evals/model-efficiency/e2/freeze.json), [catálogo](../../../prototypes/compor-mcp/evals/model-efficiency/e2/catalog.json), [skill carregável](../../../prototypes/compor-mcp/evals/model-efficiency/e2/pilot.json), [entrega](../../../prototypes/compor-mcp/evals/model-efficiency/e2/delivery.json), [diagnóstico](../../../prototypes/compor-mcp/evals/model-efficiency/e2/diagnostic.json), [run](../../../prototypes/compor-mcp/evals/model-efficiency/runs/e2-dev-mentoria-terra-low-01/report-001.json).

O runner E0/E1 congelado permanece intacto. `runner-e2.py` é uma cópia separada cuja única diferença inicial é aceitar o nome `focused_v2`; ela registra seu próprio hash/snapshot e não deve retomar runs E0/E1. O freeze registra os dois hashes.
