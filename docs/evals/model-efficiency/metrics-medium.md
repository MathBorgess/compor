# Métricas observadas — seleção explícita

Observed efficiency/integrity only; no quality scores or combined Judge results.

Tokens são o último contador confirmado de `turn.completed`. Não foram somados snapshots cumulativos. Tempos de runner, geração e compositor têm fontes e limites separados.

| Run | Estado | Último turno com tokens | Entrada + saída confirmadas | Runner ativo (ms) | Calls wire | Uso de tentativas desconhecido |
|---|---|---:|---:|---:|---:|---|
| m1-mentoria-astra-E1 | completed | 5 | 252055 | 297573.257 | 10 | [] |
| m1-mentoria-sol-E0 | failed | 1 | 49831 | 36483.491 | 2 | [2] |
| m1-mentoria-terra-E1 | completed | 5 | 343842 | 151763.009 | 15 | [] |
| m1-mentoria-astra-E0 | completed | 5 | 323029 | 356990.781 | 10 | [] |
| m1-mentoria-sol-E1 | completed | 5 | 463234 | 368251.231 | 18 | [] |
| m1-mentoria-terra-E0 | completed | 5 | 275666 | 144621.186 | 10 | [] |
| m1-startup-terra-E0 | completed | 5 | 338468 | 142143.182 | 13 | [] |
| m1-startup-sol-E1 | failed | 4 | 351487 | 337502.283 | 14 | [5] |
| m1-startup-astra-E0 | completed | 5 | 327700 | 347869.919 | 13 | [] |
| m1-startup-terra-E1 | completed | 5 | 421170 | 143700.086 | 15 | [] |
| m1-startup-sol-E0 | completed | 5 | 399784 | 284288.353 | 16 | [] |
| m1-startup-astra-E1 | completed | 5 | 382258 | 377187.32 | 15 | [] |

## Tempos separados

| Run | Geração registrada (ms) | Render + verificação conhecidos (ms) | Total de render completo (ms) | Coordenador conhecido (ms) |
|---|---:|---:|---:|---:|
| m1-mentoria-astra-E1 | 30534 | 1356.196 | 1356.196 | 1393.707 |
| m1-mentoria-sol-E0 | desconhecido | desconhecido | desconhecido | desconhecido |
| m1-mentoria-terra-E1 | 36649 | 817.768 | 817.768 | 860.711 |
| m1-mentoria-astra-E0 | 37107 | 1972.324 | 1972.324 | 2008.963 |
| m1-mentoria-sol-E1 | 32874 | 1231.262 | 1231.262 | 1274.639 |
| m1-mentoria-terra-E0 | 41587 | 1052.248 | 1052.248 | 1087.366 |
| m1-startup-terra-E0 | 39173 | 1529.569 | 1529.569 | 1692.038 |
| m1-startup-sol-E1 | 33303 | 910.402 | 910.402 | 940.575 |
| m1-startup-astra-E0 | 32894 | 1569.785 | 1569.785 | 1608.623 |
| m1-startup-terra-E1 | 39095 | 813.946 | desconhecido | 917.103 |
| m1-startup-sol-E0 | 41669 | 1187.978 | 1187.978 | 1228.455 |
| m1-startup-astra-E1 | 36867 | 1307.736 | 1307.736 | 1348.513 |

Coordenador já inclui renderização/verificação; não somar essas parcelas novamente. Reuso verificado não mede o render original. Geração é soma das durações registradas por tentativa distinta, sem afirmar tempo total de parede.

O denominador de qualquer taxa usa tempo ativo do runner, incluindo MCP, cliente e overhead. Não usa intervalo entre datas de início/fim e não mede inferência pura. Cached input e reasoning output são subconjuntos, não tokens adicionais. Falha sem usage permanece desconhecida; contador anterior inalterado não comprova custo zero.

## Integridade e cobertura

- **m1-mentoria-astra-E1**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **m1-mentoria-sol-E0**: checks divergentes=[]; não verificados=['reported_catalog_matches_wire', 'reported_tool_names_match_wire']. Falhas de infraestrutura=1; etapas do coordenador inválidas=0; erros wire={}.
- **m1-mentoria-terra-E1**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **m1-mentoria-astra-E0**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **m1-mentoria-sol-E1**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **m1-mentoria-terra-E0**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'tool_error': 1, 'invalid_tool_input': 2}.
- **m1-startup-terra-E0**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'tool_error': 1, 'invalid_tool_input': 2}.
- **m1-startup-sol-E1**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=1; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **m1-startup-astra-E0**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'tool_error': 1, 'invalid_tool_input': 4}.
- **m1-startup-terra-E1**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=1; erros wire={'invalid_tool_input': 2}.
- **m1-startup-sol-E0**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **m1-startup-astra-E1**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.

As evidências e deltas auditáveis estão no JSON associado. Modelo/esforço são observações do runtime; identidade de resposta do provedor pode estar ausente. Configuração de guidance, instruções retornadas e carregamento de skills são evidências distintas. Não há ranking criativo, cobrança medida ou inferência de sucesso humano.
