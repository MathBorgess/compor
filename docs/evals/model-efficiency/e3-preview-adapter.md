# E3 — adaptador local de preview verificável

28/10/2026. Implementado como experimento isolado depois de E2. **Transporte visual verificado; qualidade criativa ainda não avaliada.** E0 permanece default e a arquitetura v0 não foi promovida ou ampliada por este teste.

## Capacidade e limites

O adaptador acrescenta `preview_creative` às seis tools do MCP E2. Recebe apenas `slot` e `piece`, compõe com o renderer congelado e devolve diagnóstico + bloco MCP de imagem com o PNG real. Não troca palavras, ajusta fonte, recorta ativo ou corrige layout automaticamente.

- O host fixa mapa de assets com hashes, diretório de evidência, worker Python e hashes de contexto/código. O modelo não fornece caminhos, URLs, scripts ou mapas de arquivos.
- Canvas 1080×1080. Duas tentativas **por artefato** D1/D2/V1/V2/R1, reservadas atomicamente e persistidas; falhas também consomem tentativa. O refinamento do orçamento em relação à proposta inicial é explícito: são dois artefatos em T3/T4, portanto cada um precisa de tentativa inicial e um reparo. Não houve benchmark criativo sob esse novo orçamento ainda.
- R1 exige snapshot de origem e ID da camada autorizada vindos do host. Só versão, tamanho de fonte e redistribuição de palavras por quebras podem mudar; caixa, palavras/pontuação, alvo, demais camadas e ativos ficam preservados.
- Diagnóstico público contém IDs, hash e geometria medida, sem paths do host. Os relatórios completos e inputs ficam em evidência local imutável. O adaptador confere o hash do PNG antes de devolvê-lo.
- A tool declara `readOnlyHint=false`: consome orçamento e escreve evidência de teste. Não atualiza memória ou dados do produto. O worker recebe ambiente mínimo, sem herdar variáveis de credenciais.

Código: [servidor](../../../prototypes/compor-mcp/evals/model-efficiency/e3/preview_server.mjs), [entrada stdio](../../../prototypes/compor-mcp/evals/model-efficiency/e3/preview_stdio.mjs), [worker](../../../prototypes/compor-mcp/evals/model-efficiency/e3/preview_worker.py). O ponto de entrada default do protótipo não importa este adaptador.

## Verificação

**14 testes locais passaram:** dez Python e quatro de integração real com cliente MCP. Cobrem PNG/overflow, orçamento persistente e concorrente, hash de ativo, caminhos injetados, contexto alterado e revisão de camada/alcance. São fixtures técnicas de teste, sem gerador de IA. Um teste detectou que o SDK descartava campos adicionais do argumento; o schema foi tornado explicitamente estrito e a regressão passou.

```sh
node --test prototypes/compor-mcp/evals/model-efficiency/e3/test_preview_server.mjs
python -m unittest discover -s prototypes/compor-mcp/evals/model-efficiency/e3 -p 'test_preview_worker.py'
```

Python requer Pillow e as fontes locais do compositor. Não há nova instalação de contêiner ou modelo local. O renderer, os runners anteriores, as skills E2 e os resultados comparativos permanecem intactos.

## Probe nativo, sem tarefa criativa

Terra 6.1 / low recebeu um plano já pronto de E2, com pedido de uma única chamada. O teste verifica a mecânica de entrega, não geração aceitável, preferência ou ganho de eficiência.

- Uma chamada `preview_creative`, snapshot sem alteração, resposta `rendered` e um PNG com hash conferido.
- O runtime registrou Terra / low; identidade retornada pelo provedor não foi exposta.
- O modelo transcreveu marca/CTA e descreveu caderno roxo, planta de folhas escuras e envelope claro visíveis na região da imagem. Isso é evidência de uso do retorno visual, sem acesso à representação interna do pedido ou à atenção do modelo.
- 16,973 s ativos; 35.971 tokens de entrada e 915 de saída, 21.632 de entrada em cache como subconjunto. Não é benchmark de tempo, custo monetário ou qualidade.
- O gravador falhou depois da execução ao tentar serializar um Path de rollout. Eventos/wire e `result.json` parcial foram preservados; `result-recovered.json` reconstrói o relatório sem nova chamada. O script anterior foi arquivado e o gravador corrigido. O cwd de recuperação foi extraído do session_meta da própria sessão, sem verificação independente do gravador original.

Evidência: [verificação de payload/PNG](../../../prototypes/compor-mcp/evals/model-efficiency/e3/transport-probe-01/verification.json), [relatório recuperado](../../../prototypes/compor-mcp/evals/model-efficiency/e3/transport-probe-01/result-recovered.json), [freeze](../../../prototypes/compor-mcp/evals/model-efficiency/e3/transport-probe-01/freeze.json). O probe usa adaptador local com hashes antes/depois, sem cópia de snapshot do módulo E3; somente o gravador mudou depois da chamada e sua versão anterior está preservada. Os limites de isolamento nativo, incluindo menção à wiki herdada, continuam.

## Próxima execução do objetivo

Comparar Terra low E2 sem preview e com este adaptador, nos mesmos casos e com os mesmos assets fixos fornecidos desde a composição. Ambos recebem a mesma possibilidade de revisão; apenas o braço E3 tem os pixels/diagnósticos durante a elaboração. Registrar previews realmente usados, tentativas, consumo e artefatos iniciais/reparados. Não comparar diretamente este novo fator com os runs anteriores que geraram assets após T3.

Manter a rubrica ≥4 por dimensão e os gates de autoridade/edição. Replays conhecidos são desenvolvimento; uma recomendação de mínimo precisa de casos novos e repetição. Dois Judges cegos devem inspecionar a trajetória completa. Se nenhuma configuração passar, registrar o resultado sem baixar a régua.
