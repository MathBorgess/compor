# Calibração do juiz de divergência em cinco revisões

A unidade é um plano congelado de três propostas. O conjunto possui nove controles de desenvolvimento de três briefings e seis controles reservados de dois outros briefings. Cada briefing tem um trio válido, um com propostas equivalentes e um que viola a direção. O juiz vê somente contexto e prompts reordenados por ficha. Cada painel contém três controles. As sessões independentes usam o mesmo modelo, esforço e rubrica ao longo do experimento.

O controlador recompõe as decisões iniciais com o avaliador da bancada e os recibos concluídos, mostra apenas o desenvolvimento e congela os hashes do corpus, do avaliador e da rubrica. A revisão de cada rodada contém uma hipótese, os casos de desenvolvimento que a motivaram, uma alteração geral de instrução e uma previsão. A instrução acumulada é vinculada ao hash do parecer anterior antes da execução. As revisões se aplicam apenas ao experimento de calibração. O ensaio de geração e o produto conservam sua instrução de origem.

A partir da raiz, execute os seguintes comandos com a pasta da calibração inicial e um diretório novo para a cadeia. Cada arquivo da proposta tem os campos `hypothesis`, `developmentIds`, `addition` e `prediction`. Formule a revisão seguinte após observar o arquivo `rN/dev-score.json`. Os nove controles de desenvolvimento voltam em cada revisão com nova identidade cega. Nos controles corretos, as justificativas dos pares ajudam a formular uma hipótese verificável para a rodada seguinte.

```sh
juiz=scripts/evals/triagem-divergencia/plan-judge/calibration.mjs
node "$juiz" init "$cadeia" "$calibracao_inicial"
node "$juiz" dev "$cadeia" 1 "$proposta_r1"
# Repetir dev para 2, 3, 4 e 5, usando o feedback da rodada anterior.
node "$juiz" final "$cadeia" 5 "$calibracao_inicial"
node "$juiz" audit "$cadeia" "$calibracao_inicial"
```

O passo final só se abre depois do fechamento de R5 em desenvolvimento. Ele julga a reserva com a instrução original e com R5 nos mesmos grupos e recupera as decisões históricas dos seis controles para contextualizar a variação do juiz. Os resumos separam falsos aceites, falsas retenções, abstenções e localização correta do par ou da proposta. O recibo de cada painel contém o identificador da sessão e os hashes do pacote e da resposta. A amostra permite detectar erros concretos. Uma nota nos textos ainda deixa em aberto a divergência realizada nos pixels e a preferência do criador.

O comando de auditoria exige recibos existentes, reconstrói a admissão a partir dos pareceres e compara os resumos por controle. O arquivo `audit.json` registra a cadeia de revisões e os hashes dos pareceres.

## Resultados de 18 de novembro de 2026

Foram verificadas 19 sessões novas e três recibos da calibração inicial. As cinco revisões alteraram as instruções do crítico experimental. A regra de admissão e o conjunto de controles permaneceram congelados. [Instruções de cada rodada, decisões por tipo de controle e hashes dos 19 pareceres](calibration-results.json)

| Avaliação | Decisões corretas | Diagnóstico correto | Falsos aceites | Falsas retenções |
|---|---:|---:|---:|---:|
| Desenvolvimento inicial | 8/9 | 8/9 | 0 | 1 |
| R1 | 8/9 | 8/9 | 0 | 1 |
| R2, R3, R4 e R5, cada uma | 9/9 | 9/9 | 0 | 0 |
| Reserva, instrução inicial | 4/6 | 3/6 | 0 | 2 |
| Reserva, repetição da instrução inicial | 4/6 | 3/6 | 0 | 2 |
| Reserva, R5 | 5/6 | 4/6 | 0 | 1 |

R1 reconheceu quando a inversão de escala mudava de fato a hierarquia da peça. O falso bloqueio passou do trio da feira para o da troca de cadernos. A justificativa daquele novo bloqueio supôs que uma referência opcional precisava estar em uso. R2 explicitou o tratamento das cláusulas condicionais e recuperou o segundo trio. R3 a R5 mantiveram a contagem e trabalharam a diferença entre detalhe ausente e alternativa afirmada, a explicação da deriva e a clareza da escolha oferecida.

Na reserva, R5 admitiu corretamente a inversão de hierarquia do cais. O rótulo congelado considerava aceitável o trio de sementes. O prompt, porém, pede uma legenda para identificar o núcleo do corte e ao mesmo tempo limita os textos visíveis ao nome e à edição. O juiz reteve esse trio. No controle de paráfrase do mesmo briefing, reteve a ação e apontou essa contradição em vez do par repetido. Isso explica a diferença entre 5 decisões corretas e 4 diagnósticos localizados. A ambiguidade do caso precisa de revisão antes de outra calibração. Os seis controles e os rótulos originais foram preservados. A diferença observada equivale a um controle da reserva e continua sem medição de preferência humana.
