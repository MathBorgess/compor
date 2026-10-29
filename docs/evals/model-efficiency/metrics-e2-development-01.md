# Métricas observadas — seleção explícita

Observed efficiency/integrity only; no quality scores or combined Judge results.

Tokens são o último contador confirmado de `turn.completed`. Não foram somados snapshots cumulativos. Tempos de runner, geração e compositor têm fontes e limites separados.

| Run | Estado | Último turno com tokens | Entrada + saída confirmadas | Runner ativo (ms) | Calls wire | Uso de tentativas desconhecido |
|---|---|---:|---:|---:|---:|---|
| e2-dev-mentoria-terra-low-01 | completed | 5 | 313198 | 138415.907 | 10 | [] |

## Tempos separados

| Run | Geração registrada (ms) | Render + verificação conhecidos (ms) | Total de render completo (ms) | Coordenador conhecido (ms) |
|---|---:|---:|---:|---:|
| e2-dev-mentoria-terra-low-01 | 37151 | 1006.818 | 1006.818 | 1047.954 |

Coordenador já inclui renderização/verificação; não somar essas parcelas novamente. Reuso verificado não mede o render original. Geração é soma das durações registradas por tentativa distinta, sem afirmar tempo total de parede.

O denominador de qualquer taxa usa tempo ativo do runner, incluindo MCP, cliente e overhead. Não usa intervalo entre datas de início/fim e não mede inferência pura. Cached input e reasoning output são subconjuntos, não tokens adicionais. Falha sem usage permanece desconhecida; contador anterior inalterado não comprova custo zero.

## Integridade e cobertura

- **e2-dev-mentoria-terra-low-01**: checks divergentes=[]; não verificados=[]. Falhas de infraestrutura=0; etapas do coordenador inválidas=0; erros wire={'tool_error': 1}.

As evidências e deltas auditáveis estão no JSON associado. Modelo/esforço são observações do runtime; identidade de resposta do provedor pode estar ausente. Configuração de guidance, instruções retornadas e carregamento de skills são evidências distintas. Não há ranking criativo, cobrança medida ou inferência de sucesso humano.
