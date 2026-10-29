# Resultados por trajetória

O menor modelo/effort aceitável **não foi estabelecido** nesta rodada. Nenhum dos 24 pacotes atingiu todos os critérios nos dois Judges. As notas abaixo são o menor valor entre alinhamento, adequação, encantamento e diversidade; as notas por peça e as justificativas permanecem nos relatórios originais. NA não vira zero.

| Run | PNGs/5 | Menor nota A/B | Tokens confirmados¹ | Runner ativo² (s) | Falha/limite |
|---|---:|---|---:|---:|---|
| `r1-mentoria-sol-E0` | 5/5 | 3/3 | 250713 | 241.7 | — |
| `r1-mentoria-sol-E1` | 5/5 | 2/3 | 356554 | 257.0 | — |
| `r1-mentoria-astra-E1` | 5/5 | 2/3 | 293975 | 327.7 | — |
| `r1-mentoria-astra-E0` | 2/5 | 3/3 | 106391 | 213.3 | Capacidade do serviço; uso da tentativa desconhecido |
| `r1-mentoria-terra-E1` | 5/5 | 2/3 | 386164 | 155.1 | — |
| `r1-mentoria-terra-E0` | 5/5 | 2/3 | 269974 | 129.6 | — |
| `r1-startup-sol-E1` | 4/5 | 3/4 | 400909 | 272.2 | Overflow; revisão sem PNG |
| `r1-startup-astra-E1` | 5/5 | 3/3 | 345871 | 357.0 | — |
| `r1-startup-sol-E0` | 5/5 | 3/3 | 368129 | 207.4 | — |
| `r1-startup-astra-E0` | 5/5 | 3/3 | 247065 | 341.1 | — |
| `r1-startup-terra-E0` | 5/5 | 3/3 | 307825 | 135.7 | — |
| `r1-startup-terra-E1` | 5/5 | 3/3 | 471674 | 162.5 | — |
| `m1-mentoria-sol-E1` | 5/5 | 3/3 | 463234 | 368.3 | — |
| `m1-mentoria-sol-E0` | 0/5 | NA/NA | 49831 | 36.5 | Capacidade do serviço; uso da tentativa desconhecido |
| `m1-mentoria-terra-E0` | 5/5 | 2/3 | 275666 | 144.6 | — |
| `m1-mentoria-terra-E1` | 5/5 | 3/3 | 343842 | 151.8 | — |
| `m1-mentoria-astra-E0` | 5/5 | 3/3 | 323029 | 357.0 | — |
| `m1-mentoria-astra-E1` | 5/5 | 3/3 | 252055 | 297.6 | — |
| `m1-startup-sol-E0` | 5/5 | 3/3 | 399784 | 284.3 | Caixa da headline ampliada além do contrato estrito |
| `m1-startup-terra-E0` | 5/5 | 3/3 | 338468 | 142.1 | — |
| `m1-startup-sol-E1` | 4/5 | 3/3 | 351487 | 337.5 | Capacidade do serviço; uso da tentativa desconhecido |
| `m1-startup-terra-E1` | 4/5 | 3/3 | 421170 | 143.7 | Overflow; revisão sem PNG |
| `m1-startup-astra-E1` | 5/5 | 3/3 | 382258 | 377.2 | — |
| `m1-startup-astra-E0` | 5/5 | 3/3 | 327700 | 347.9 | — |

¹ Entrada + saída no último contador confirmado; cache e reasoning são subconjuntos. Não somar snapshots cumulativos. Nos runs interrompidos, a linha representa o prefixo conhecido, não o custo total. Não há comparação monetária: cobrança e consumo do gerador de imagens não foram expostos.

² Inclui cliente/MCP/overhead; exclui pausas do coordenador e geração de assets. Os tempos completos separados estão em [low v2](metrics-low-v2.md) e [medium](metrics-medium.md). Não usar tempo de trajetórias incompletas para declarar vantagem.

Cobertura: 109 PNGs compostos, 19 trajetórias com os cinco PNGs, 3 falhas de capacidade, 2 overflows. 91 chamadas MCP inválidas/erro de tool foram registradas e recuperadas antes dos planos finais disponíveis. Contagem de erro não inclui indisponibilidade do modelo.

E0 = baseline do PR8. E1 = descrições/exemplos, sem mudar validators, respostas ou skills. `r1` = low; `m1` = medium. Uma trajetória por célula e caso; a segunda réplica low prevista não foi executada, conforme [adaptação](adaptation-01.md).

O script de agregação não transforma as notas em aprovação humana. Os gates técnicos e os limites de isolamento permanecem separados; em particular, o Sol E0 medium startup preservou palavras/outras camadas/asset, mas alterou a altura da caixa da headline, além de escala e quebra previstas.
