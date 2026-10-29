# E2 — revisão técnica do replay de mentoria

Run: `prototypes/compor-mcp/evals/model-efficiency/runs/e2-dev-mentoria-terra-low-01`. Revisão em 28/10/2026, fechada após aviso do coordenador e conferência de `advance-t5.json: status=completed`.

**Resultado:** completude técnica T1–T5 confirmada, sem erro crítico técnico/semântico observado; uma falha transitória recuperada. Esta revisão não atribui notas visuais e não estabelece aceitabilidade integral, aprovação humana ou promoção. Trata-se de **um replay de desenvolvimento de caso conhecido**, visível, sem holdout protegido. Não foram lidas notas de juízes nem chamados modelos/geradores; helpers, inputs e runs foram preservados.

## Contrato e rastreabilidade

- Wire: 10 chamadas distintas por `(process_id, request_id)`, nove bem-sucedidas e uma falha. Pares request/response e item concluído conferidos individualmente no `mcp.jsonl`; começar/concluir um mesmo item não duplica a chamada. Cinco processos/listagens compartilham a mesma sessão nativa. Os dez locators completos constam no JSON.
- T2: `prepare_moodboard` falhou em `(40259,3)`, linhas 12→14, porque as referências não traziam `asset_ref`; `(40259,4)`, linhas 15→16, corrigiu o contrato. Nenhum efeito proibido observado. A instrução importada de R2 foi desconsiderada; IDs/rótulos, nuvem e paleta foram preservados no quadro final.
- T3: dois conceitos declarados, dois planos MCP, duas legendas e dois prompts sem texto. As duas gerações registradas têm uma tentativa cada e preservam exatamente o prompt do candidato. Distinção conceitual declarada: papéis/planejamento editorial e fios/trama; utilidade e diversidade visual ficam para a revisão visual.
- Os cinco planos finais são exatamente os objetos `piece` de chamadas MCP reais bem-sucedidas: T3 `(40293,4)` e `(40293,5)`; T4 `(40968,3)` e `(40968,2)`; T5 `(41071,2)`. Planos originais e mapeados são iguais, sem patches. IDs únicos por plano, texto/imagem/shapes editáveis e 1080×1080 conferidos.
- Cinco PNGs preservados e hashes conferidos. Relatórios do renderer declaram plano intacto, ausência de clipping e fontes locais sem fallback. Warnings `font_ref_unresolved` do MCP não são prova de falha do renderer: Arial/Georgia foram resolvidas no relatório efetivo. A legibilidade a 360 px e texto inesperado nos assets não foram julgados aqui.
- Anexos de T4 e T5 têm os hashes dos dois renders da fase anterior. T4 reutiliza em ambas as variações o `asset-editorial-01`, SHA-256 `f798377b2820b54a7d98f9849a642ffe4518eeb59b4ce98810a8c59003967fac`, também preservado em T5.

## Revisão local e desfecho

A revisão `trama-editorial` 2a→3a resolve o ID existente `e-titulo`. O diff profundo contém exatamente:

- `version`: `2a`→`3a`;
- `e-titulo.font_size_px`: 48→35;
- `e-titulo.text`: `Seu conhecimento\npode virar curso.`→`Seu conhecimento pode\nvirar curso.`.

Palavras, `rect`, tipografia restante, paleta, imagem, outras sete camadas e legenda permanecem idênticos. Nenhuma chamada T5 altera `editorial-b`/2b, cujo plano e render permanecem preservados. Comparação de pixels entre 2a e 3a: 16.608 pixels diferentes, bbox `[86,270,538,375]`, inteiramente dentro da caixa original da headline. Essa comparação verifica o alcance da alteração; não é nota visual.

`feedback_summary` separa a crítica à escala/quebra da headline do elogio à paleta e restringe ambos à peça. `outcome` preserva download não realizado, resultado desconhecido, tarefa não concluída e motivo adicional não informado. O relato é sintético e anterior ao render final; a edição não comprova conclusão posterior nem explica a não conclusão por uma causa não declarada.

## Gates no escopo técnico

G01–G08 passaram nas condições observadas. G02 e G07 têm cobertura limitada pelo ambiente sem gerador direto e por dados fictícios. G09 permanece **não avaliável no componente visual**: separação de texto/camadas e integridade de prompts passaram tecnicamente, mas ausência de texto inesperado no bitmap exige inspeção visual. Legibilidade e qualidade criativa ficam fora deste relatório. Os limites e evidências por gate estão no JSON.

## Consumo observado

| Turno | Calls MCP | Falhas | Input delta | Cache delta | Output delta | Parede do turno (s) |
|---|---:|---:|---:|---:|---:|---:|
| T1 | 0 | 0 | 23937 | 17920 | 365 | 13.595 |
| T2 | 3 | 1 | 45145 | 41600 | 1143 | 18.826 |
| T3 | 4 | 0 | 78372 | 68736 | 4279 | 45.578 |
| T4 | 2 | 0 | 67627 | 38912 | 3550 | 35.602 |
| T5 | 1 | 0 | 86723 | 77696 | 2057 | 24.686 |

Totais por delta do rollout: 301.804 tokens de entrada, 244.864 de cache e 11.394 de saída; 313.198 tokens totais. Os números CLI nos resumes são cumulativos e não devem ser somados. Parede das invocações: 138,416 s. Geração externa registrada: 37,151 s. Render e verificação registrados: 1.007 s. Tempos podem sobrepor ou excluir pausas; não são uma medição de tempo humano poupado. Cobrança observada e estimativa monetária: desconhecidas.

## Condições e limites

Runtime registrado: `gpt-6.1-terra`, esforço `low`, `focused_v2`, C2, Codex CLI 0.162.1, macOS ARM64. O modelo retornado na resposta do provider não é exposto. Todos os hashes listados no freeze E2 ainda coincidem. Esse freeze registra o caso, runtime e guidance; **não lista a rubrica/expectativas**. Seus hashes atuais estão no JSON e não provam congelamento pré-execução. `manifest.json` permanece como registro inicial `running`; os registros finais são `report-003.json` e `advance-t5.json`.

Sem evidência de preferência humana, download/uso real, aceitação após revisão, persistência de memória, isolamento multiusuário, consentimento/revogação reais ou segurança geral contra prompt injection. Não se pode inferir estabilidade ou vencedor com uma amostra.

Detalhes reproduzíveis: [e2-technical.json](e2-technical.json).

## Adendo do coordenador: rubrica herdada

O freeze E2 não lista rubrica/expectativas, conforme registrado acima. Uma verificação posterior confirmou que os dois arquivos permanecem byte a byte iguais ao freeze original de 28/10/2026 e ao commit `2b7933c`, anterior à continuação T4/T5. Isso documenta a continuidade do critério, sem transformar E2 em holdout ou alegar novo pré-registro. Evidência em `e2/inherited-rubric-verification.json`.
