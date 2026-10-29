# Métricas observadas — seleção explícita

Observed efficiency/integrity only; no quality scores or combined Judge results.

Tokens são o último contador confirmado de `turn.completed`. Não foram somados snapshots cumulativos. Tempos de runner, geração e compositor têm fontes e limites separados.

| Run | Estado | Último turno com tokens | Entrada + saída confirmadas | Runner ativo (ms) | Calls wire | Uso de tentativas desconhecido |
|---|---|---:|---:|---:|---:|---|
| r1-mentoria-terra-E0 | completed | 5 | 269974 | 129625.89 | 11 | [] |
| r1-mentoria-sol-E1 | completed | 5 | 356554 | 257021.033 | 12 | [] |
| r1-mentoria-astra-E0 | failed | 3 | 106391 | 213314.349 | 6 | [4] |
| r1-mentoria-terra-E1 | completed | 5 | 386164 | 155111.04 | 17 | [] |
| r1-mentoria-sol-E0 | completed | 5 | 250713 | 241670.332 | 9 | [] |
| r1-mentoria-astra-E1 | completed | 5 | 293975 | 327675.203 | 10 | [] |
| r1-startup-astra-E1 | completed | 5 | 345871 | 356955.207 | 15 | [] |
| r1-startup-sol-E0 | completed | 5 | 368129 | 207376.199 | 17 | [] |
| r1-startup-terra-E1 | completed | 5 | 471674 | 162501.45 | 16 | [] |
| r1-startup-astra-E0 | completed | 5 | 247065 | 341077.048 | 9 | [] |
| r1-startup-sol-E1 | completed | 5 | 400909 | 272247.964 | 16 | [] |
| r1-startup-terra-E0 | completed | 5 | 307825 | 135718.769 | 12 | [] |

## Tempos separados

| Run | Geração registrada (ms) | Render + verificação conhecidos (ms) | Total de render completo (ms) | Coordenador conhecido (ms) |
|---|---:|---:|---:|---:|
| r1-mentoria-terra-E0 | 38515 | 823.481 | desconhecido | 1046.45 |
| r1-mentoria-sol-E1 | 33886 | 1755.382 | 1755.382 | 1794.071 |
| r1-mentoria-astra-E0 | 28875 | 526.644 | 526.644 | 537.14 |
| r1-mentoria-terra-E1 | 29248 | 1297.701 | 1297.701 | 1335.684 |
| r1-mentoria-sol-E0 | 34859 | 1082.763 | 1082.763 | 1122.757 |
| r1-mentoria-astra-E1 | 32752 | 1592.022 | 1592.022 | 1627.753 |
| r1-startup-astra-E1 | 32135 | 1734.867 | 1734.867 | 1785.875 |
| r1-startup-sol-E0 | 37822 | 1127.386 | 1127.386 | 1174.629 |
| r1-startup-terra-E1 | 36936 | 957.916 | 957.916 | 1002.558 |
| r1-startup-astra-E0 | 35700 | 1296.0 | 1296.0 | 1336.833 |
| r1-startup-sol-E1 | 39700 | 1028.366 | desconhecido | 1080.707 |
| r1-startup-terra-E0 | 44926 | 1158.49 | 1158.49 | 1206.28 |

Coordenador já inclui renderização/verificação; não somar essas parcelas novamente. Reuso verificado não mede o render original. Geração é soma das durações registradas por tentativa distinta, sem afirmar tempo total de parede.

O denominador de qualquer taxa usa tempo ativo do runner, incluindo MCP, cliente e overhead. Não usa intervalo entre datas de início/fim e não mede inferência pura. Cached input e reasoning output são subconjuntos, não tokens adicionais. Falha sem usage permanece desconhecida; contador anterior inalterado não comprova custo zero.

## Integridade e cobertura

- **r1-mentoria-terra-E0**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=1; erros wire={'invalid_tool_input': 4}.
- **r1-mentoria-sol-E1**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **r1-mentoria-astra-E0**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=1; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **r1-mentoria-terra-E1**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 6}.
- **r1-mentoria-sol-E0**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **r1-mentoria-astra-E1**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **r1-startup-astra-E1**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **r1-startup-sol-E0**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'tool_error': 1, 'invalid_tool_input': 4}.
- **r1-startup-terra-E1**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **r1-startup-astra-E0**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'invalid_tool_input': 4}.
- **r1-startup-sol-E1**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=1; erros wire={'invalid_tool_input': 4}.
- **r1-startup-terra-E0**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'tool_error': 1, 'invalid_tool_input': 2}.

As evidências e deltas auditáveis estão no JSON associado. Modelo/esforço são observações do runtime; identidade de resposta do provedor pode estar ausente. Configuração de guidance, instruções retornadas e carregamento de skills são evidências distintas. Não há ranking criativo, cobrança medida ou inferência de sucesso humano.
