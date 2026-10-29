# Calibração Phoenix: estudo sintético reproduzível

Em 29/10/2026, este estudo examinou uma **simulação offline**, não comportamento de pessoas. A base do código era `64203d18de1d24a98a3bf83cdd5fd425cad3b1ff` em macOS Darwin arm64, Node.js v24.16.0. O protótipo continuou com os valores padrão: o candidato abaixo **não foi promovido**. O arquivo [result.json](result.json) registra todos os 97 ensaios, parâmetros, métricas, sementes, hashes dos conjuntos, fontes e código compilado, além da comparação por sessão do teste reservado.

## Por que adaptar o anexo

O exemplo fornecido usa Python, NumPy e Optuna, mas o motor desta branch é TypeScript. Além disso, o candidato marcado como correto recebe, por construção, probabilidades muito superiores e SID diferente dos demais, e está sempre no índice zero. Os históricos são ruído independente da preferência. Os mesmos casos são usados em todas as tentativas, sem teste reservado. O score do exemplo usa mistura `0,4*cos + 0,6*rank/25`, diferente da fórmula real, e a métrica descrita como NDCG@1 é ganho descontado entre as três primeiras posições. Essas condições podem produzir um resultado alto sem demonstrar que os parâmetros funcionam para pessoas.

## Método

- Geramos sessões a partir de sementes fixas: 64 de busca, 48 de validação e 96 de teste. Cada sessão tem 24 candidatos e vetores de dimensão 32. As listas de sementes e os hashes estão no JSON; não existem sessões comuns entre divisões.
- Cada sessão contém uma preferência latente, consulta e históricos positivamente/negativamente correlacionados com ela e um sinal de longo prazo imperfeito. A utilidade sintética combina a aderência à preferência e um atributo de qualidade, com ruído. Os rótulos graduados 0–3 são derivados dessa utilidade; não são escolhas humanas. O SID é sorteado sem usar o rótulo. As probabilidades multi-ação são estimativas sintéticas ruidosas, não saídas de um modelo.
- Para cada configuração, aplicamos as funções TypeScript compiladas de User Tower, cosseno e score multi-ação reais. Reproduzimos a pré-seleção real `max(2 * top_n_results, 12)` por cosseno, seu arredondamento e o pós-processamento de diversidade SID. Não executamos o roteador, provedores externos ou ranker de modelo: sua distribuição de probabilidades e suas dependências do perfil podem ser diferentes.
- Usamos **busca aleatória**, não Optuna: os valores padrão mais 96 configurações sorteadas com semente `331337` e intervalos explícitos no script. Ordenamos pelo NDCG@3 no conjunto de busca, submetemos as 12 primeiras configurações à validação e escolhemos a maior NDCG@3 na validação; em empate, vence o menor índice. Depois avaliamos uma única vez o escolhido e o padrão no conjunto reservado. Os sete pesos multi-ação são parâmetros distintos; prior, quota, profundidade SID e top-N permaneceram nos padrões.
- NDCG@3 usa ganho `2^relevância - 1` com desconto `log2(posição+1)` e normalização contra os três melhores de **todos** os candidatos da sessão; a métrica, portanto, também penaliza perda na pré-seleção. Hit@3 mede presença de pelo menos um dos dois candidatos de relevância máxima. Diversidade@3 é a fração de prefixos SID distintos nas três primeiras posições. Recall da pré-seleção é a fração dos dois candidatos de relevância máxima mantidos no pool. O intervalo de 95% usa 2.000 reamostragens bootstrap pareadas por sessão, semente `50021`; mede apenas incerteza amostral dentro desta simulação.

## Seleção e resultado

A configuração escolhida foi a **72**. Na busca sua NDCG@3 foi 0,766563 e na validação 0,736734; o padrão obteve 0,731569 na busca e 0,702941 na validação. A comparação abaixo usa somente o conjunto reservado de teste.

| Medida | Padrão | Configuração 72 |
|---|---:|---:|
| NDCG@3 | 0,677843 | 0,727268 |
| Hit@3 | 0,854167 | 0,875000 |
| Diversidade@3 | 0,923611 | 0,895833 |
| Recall de relevância máxima no pool | 0,770833 | 0,807292 |

A diferença pareada de NDCG@3 foi **+0,049424**, com intervalo bootstrap de **[+0,020911; +0,078620]** na simulação. A diversidade diminuiu. Isso descreve o comportamento deste gerador e destes intervalos; não estabelece melhora no produto, preferência humana, causalidade, calibração das probabilidades do modelo ou superioridade fora desse espaço de busca. O critério de seleção não impôs piso de diversidade.

| Parâmetro ajustado | Padrão | Configuração 72 |
|---|---:|---:|
| `alpha_query_weight` | 0,5 | 0,3706 |
| `beta_positive_session` | 0,35 | 0,3885 |
| `gamma_negative_session` | 0,25 | 0,1079 |
| `delta_long_term_taste` | 0,2 | 0,1031 |
| `ema_session_decay` | 0,85 | 0,8090 |
| `sid_diversity_decay_factor` | 0,65 | 0,9295 |
| `p_use_as_layout_grid` | 12 | 9,5313 |
| `p_use_as_typography_hook` | 10 | 13,9084 |
| `p_use_color_and_vibe` | 8 | 14,2457 |
| `p_high_conversion_clarity` | 15 | 12,2540 |
| `p_dwell_engagement` | 4 | 6,3122 |
| `p_reject_too_generic` | -25 | -34,3085 |
| `p_reject_style_mismatch` | -30 | -13,7049 |

## Reprodução e próximos passos

Na pasta `prototypes/compor-mcp`, execute:

```sh
npm run build
node scripts/calibration/phoenix-calibration.mjs ../../docs/evals/2026-10-29-phoenix-calibracao/result.json
node --test test/phoenix-calibration.test.mjs
```

O script não usa rede nem altera a configuração do Phoenix. O teste verifica determinismo, divisão de sementes, invariantes dos dados e igualdade com o resultado preservado. Para calibração com validade de produto, reúna casos de escolha e rejeição com consentimento específico para avaliação, preserve fonte/versão/contexto, faça rótulos humanos independentes, separe participantes e campanhas entre busca e teste, defina limites de diversidade e custo antes da seleção e obtenha revisão humana antes de qualquer promoção. Avaliar logprobs e latência é um experimento separado; este estudo não os mede.

## Ranker experimental com logprobs

O código foi adicionado como alternativa explícita (`ranker_mode: "logprobs"`), sem substituir o ranker multi-ação padrão. Ele envia **metadados**, não pixels, exige consentimento para o modelo e usa por padrão o `gpt-4.1-mini` do exemplo. A saída não é probabilidade calibrada nem previsão validada de conversão. Para não fabricar distribuição a partir de top-k incompleto, o experimento exige as quatro letras exatas e massa de categorias de pelo menos 0,9; respostas incompletas, massa inválida e erros resultam em abstenção. Quando todos se abstêm, a operação informa falha, sem trocar silenciosamente de motor.

Em 29/10/2026, fizemos uma comparação pontual na API com seis descrições fictícias, mesmo contexto e uma chamada de aquecimento por alternativa; as seis solicitações de cada braço rodaram em paralelo. O caminho existente usou Responses API e `gpt-6-luna`; o experimental usou Chat Completions e `gpt-4.1-mini-2025-04-14`. Os modelos, endpoints, prompts e resultados diferem; portanto, o experimento mede os caminhos completos propostos, não o efeito isolado de logprobs. As medições, tokens, resultados e abstenções estão em [logprobs-benchmark.json](logprobs-benchmark.json). Mediana e P95 usam interpolação sobre seis observações; não são estimativas robustas.

| Medida no lote medido | Multi-ação existente | Logprobs experimental |
|---|---:|---:|
| Candidatos pontuados | 6/6 | 1/6 |
| Abstenções | 0/6 | 5/6 |
| Mediana de latência por chamada | 3.816 ms | 887 ms |
| P95 observado por interpolação | 4.737 ms | 2.040 ms |
| Tokens de entrada / saída | 3.658 / 1.431 | 1.786 / 6 |
| Tokens de entrada em cache | 0 | 0 |
| Custo estimado, somente lote medido | US$ 0,0010813 | US$ 0,0007240 |

O custo é calculado a partir dos tokens informados e dos preços padrão publicados em 29/10/2026: Luna US$ 0,10/1M tokens de entrada e US$ 0,50/1M de saída; GPT-4.1 Mini US$ 0,40/1M de entrada e US$ 1,60/1M de saída. Não é cobrança verificada, nem inclui aquecimento, sondagens ou outros custos. Os resultados e a precificação podem mudar. Fontes: [preços da OpenAI](https://developers.openai.com/api/docs/pricing), [GPT-4.1 Mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

O braço de logprobs retornou mais rapidamente neste lote, mas não conseguiu pontuar cinco candidatos: três por categorias ausentes e dois por massa numericamente inconsistente. A comparação não demonstra um ranker utilizável mais rápido, nem equivalência de qualidade. O teste inicial, anterior ao ajuste de classificação de massa inválida, foi preservado em [logprobs-benchmark-inicial.json](logprobs-benchmark-inicial.json). Uma sondagem adicional com temperaturas 0,5 e 1 pontuou 2/6 em cada temperatura ([logprobs-temperature.json](logprobs-temperature.json)); trata-se de exploração adicional, sem validação humana. O modelo GPT-4.1 Mini está [depreciado](https://developers.openai.com/api/docs/deprecations); a opção de modelo é configurável, e acesso/logprobs devem ser verificados em cada modelo.

Os caminhos podem ser reproduzidos após o build por `node scripts/benchmarks/phoenix-logprobs.mjs CAMINHO.json` e `node scripts/benchmarks/phoenix-temperature-probe.mjs CAMINHO.json`, com uma chave autorizada fornecida ao processo pelo host. Eles fazem chamadas pagas; não registram a chave. Prefixo comum e `prompt_cache_key` não garantem reutilização. As respostas reportaram zero tokens em cache nessa execução; não há base para afirmar ganhos de cache. [Documentação de cache](https://developers.openai.com/api/docs/guides/prompt-caching) e [logprobs](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

**Decisão:** manter ambos os ajustes como candidatos experimentais. Antes de promover, coletar exemplos com consentimento específico para avaliação e rótulos humanos independentes, estabelecer critérios de qualidade/diversidade/cobertura e medir latência e custo em amostra maior. Os dados disponíveis não sustentam afirmar os melhores hiperparâmetros para o produto.

## Reexecução após corrigir SIDs desconhecidos

O tratamento de diversidade foi alterado para não agrupar artificialmente candidatos com SID desconhecido. A [nova execução sintética](result-after-unknown-sid.json) preserva separadamente o resultado original e os hashes das fórmulas atualizadas. Nesta simulação, os 97 ensaios, a escolha da configuração 72 e as métricas do teste reservado permaneceram iguais; os hashes do código-fonte e das fórmulas compiladas mudaram. Os casos sintéticos já tinham SIDs preenchidos, portanto essa igualdade **não avalia o novo comportamento com metadados desconhecidos ou pessoas reais**. Não houve promoção de parâmetros.
