# Dataset de qualidade criativa

[Dataset v1](dataset.v1.json) e [rubrica de direção de publicidade v1](rubrica-direcao-publicitaria.v1.md). A unidade experimental é o mesmo pedido, referências e histórico em braços independentes. A unidade de reação humana é a versão efetivamente mostrada, com a imagem e a legenda. A versão do conjunto e os hashes das fontes, da revisão do prompt, do fluxo do gerador, da rubrica, dos anexos e dos recibos identificam o ensaio.

## Sessões reaproveitadas

| Origem | Evidência | Uso nesta bancada |
| --- | --- | --- |
| [PR 61, Marco 5](../../../docs/evals/pr61/05-post.md) | Dez PNGs de 360 px e legendas em duas trajetórias do protótipo, com 3/10 peças aprovadas pela régua antiga e 0/10 reações humanas. | Replay de arte e legenda. As conversas roteirizadas de Volta de Pote e Trama de Aula foram adaptadas para pedidos do estúdio. As entradas históricas têm contratos distintos. |
| [Triagem de 18/11](../../../docs/evals/triagem-divergencia-2026-11-18/README.md) | Sessões reais do planejador e 24 imagens do provedor, por pedidos sintéticos e com autorização daquela bancada. | Reutiliza a amostra de paleta da feira, com o escopo explícito no pedido. A rodada histórica mede o efeito de anexos opcionais. |
| Turno de verificação do estúdio de 17/11 | Metadados locais de um turno HTTP 200 concluído com identificador de sessão, turno, requisição do provedor e texto presente. | Evidência de execução. Nenhum briefing, arte, legenda ou reação vinculados foi incorporado ao corpus. |

O dataset versionado contém somente casos sintéticos. Um caso de produção requer autorização para a finalidade de avaliação, vínculo entre contexto original, versão exibida e respostas, e edição local de dados identificáveis antes da inclusão. Consentimento de personalização ou geração anterior cobre suas próprias finalidades. [ADR 0006](../../../docs/adr/0006-feedback-e-evolucao-do-harness.md)

## Casos, controles e comparação

Os três casos de desenvolvimento representam produto digital com oferta sem números, mentoria com restrições de voz e evento com referência cromática escolhida. Os dois casos de reserva exercitam um cartaz com surrealismo intencional e uma oferta com informações ainda abertas. O arquivo é versionado e visível a mantenedores. Para reserva operacional, congele a candidata antes de abrir os casos e seus pareceres. Novas iterações precisam de nova reserva para recuperar independência.

Use `cases[].input` para cada braço. Passe `expectations` apenas à avaliação. Cada caso executa em conversas independentes com as mesmas entradas e parâmetros, incluindo qualquer imagem de referência. Mantenha o controle vigente como baseline. Cegue a ordem dos braços e a identificação da revisão. Se o provedor não expõe sementes, registre essa limitação e o número de gerações. Mostre cada peça a 360 px e em resolução original. Falhas de execução e abstenções permanecem no denominador da entrega. Calcule diferenças criativas apenas para observações comparáveis e relate essa cobertura.

Os quatro PNGs de controle são desenhados offline para calibrar leitura de pixels. O primeiro usa um motivo visual apoiado no calendário. O segundo preserva o texto e imita publicidade intercambiável. Os demais concentram corrupção tipográfica ou fusão do motivo central. Os controles textuais exercitam invenção de promessa e indisponibilidade de pixels. Esperados e rótulos ficam com a apuração. A prova visual está no PNG. Replays e controles ocupam conjuntos próprios e ficam fora da estimativa de mudança entre braços.

Para validar localmente a estrutura, a proveniência e as impressões digitais dos arquivos, execute:

```sh
python3 scripts/evals/qualidade-criativa/verificar-dataset.py
```

Os PNGs de controle congelados ficam em `fixtures/`. Para reconstruí-los no Mac, execute `python3 scripts/evals/qualidade-criativa/fixtures/draw.py` com Pillow e a fonte Georgia Bold instalada. A inspeção de referência usa os PNGs versionados. A reconstituição dos casos antigos não indica autoria, aprovação ou uso da peça.

## Replay visual com referências sintéticas

A reserva [Meu primeiro caderno](reserva-referencias-visuais.v1.json) tem duas referências com funções diferentes. Paleta fornece ameixa, creme e laranja. Recorte fornece a diagonal na borda inferior direita e tem cores próprias que a peça deve deixar de fora. Na variante com origem desconhecida, Recorte permanece no contexto do pedido e seus pixels ficam fora do manifesto. O caso testa se o briefing reconhece essa lacuna e usa a descrição recebida.

Na raiz do Compor, com as dependências de `packages/agents-api` instaladas, capture o corpo que o handler monta para o provedor simulado. Esse comando roda localmente e dispensa autenticação.

```sh
python3 scripts/evals/qualidade-criativa/executar.py \
  --dataset scripts/evals/qualidade-criativa/reserva-referencias-visuais.v1.json \
  capture reserva-encadernacao-duas-referencias . /tmp/compor-ref-captura
```

Use um diretório de saída novo. Examine `session-request.json` para ver o manifesto, a ordem dos IDs rotulados e os PNGs anexados. O JSON contém os próprios pixels em base64. Os arquivos da reserva estão limitados a `fixtures/`, com hashes conferidos antes da captura.

Para executar a fase de modelo em uma rodada autorizada, use `replay` no lugar de `capture`. O replay verifica o vínculo de cada rótulo e anexa os bytes capturados na mesma ordem, com os IDs e hashes registrados. Essa rodada envia os PNGs sintéticos ao Codex e produz briefing, proposta e legenda. A captura local demonstra o transporte. A interpretação dos papéis e o resultado na arte exigem o replay e a leitura dos pixels renderizados.

## Métrica humana

Pergunte à pessoa que solicitou o post, por versão, após exibir juntos imagem e legenda em ordem cega.

1. **De 1 a 5, quanto você ficou empolgado para compartilhar esta versão?** 1 = nenhuma vontade, 3 = vontade moderada, 5 = muita vontade.
2. **De 1 a 5, quanto esta versão parece específica da sua ideia e da sua voz?** 1 = genérica a ponto de servir para outro post, 3 = parcialmente específica, 5 = reconhecivelmente minha.
3. **Que detalhe mais influenciou sua resposta?** Texto opcional. Ofereça “ainda não sei” e “prefiro não responder” nas duas escalas.

A métrica principal é a proporção com empolgação ≥ 4 e especificidade ≥ 4 entre versões com as duas respostas válidas. Registre também as duas distribuições, os dois numeradores isolados, o número de versões elegíveis, exibidas e respondidas, e os pares com resposta completa nos dois braços. Use uma resposta por pergunta, pessoa e versão, com registro da última revisão. Em comparações de poucas peças, mostre os valores por caso e os totais. As taxas de piloto do Marco 5 seguem hipóteses, por isso 4–5 é uma faixa favorável e não implica adoção de uma taxa populacional. Se ninguém respondeu, escreva **indisponível**. Todos os casos publicados no dataset têm `humanFeedback: null`.

Julgamentos de direção de publicidade e controles calibrados podem medir aderência, execução e especificidade antes de um piloto humano. Salvamento, download, aprovação, intenção e compartilhamento efetivo têm os seus próprios significados e registros. Publicação e desempenho podem ser conferidos depois, com autorização e janela combinada.

Para apurar respostas locais autorizadas, execute `python3 scripts/evals/qualidade-criativa/resumir-reacoes.py RESPOSTAS.json`. Use uma lista com `pair` pseudônimo por pessoa e pedido, `arm` como `base` ou `candidata`, `version` da entrega, `shown` booleano e `excitement` e `specificity` como nota de 1 a 5, `unsure`, `declined` ou `null`. Considere a revisão mais recente de cada resposta antes de exportar. Uma lista vazia registra taxas indisponíveis nos dois braços.

O [relatório de execução](../../../docs/evals/qualidade-criativa-2026-11-18/README.md) descreve os replays e os comandos.

## Auditoria do caso real

No pacote autorizado, execute a auditoria offline com o dataset congelado, o manifesto da referência e a execução registrada. Os dois últimos argumentos são caminhos dentro da pasta do dataset.

```sh
python3 scripts/evals/qualidade-criativa/auditar-caso-real.py \
  PACOTE/dataset-caso-real-privado.v2.json \
  referencia-de-sucesso.json juiz-caso-real-fatos-revisados/run
```

A auditoria recompõe os pacotes cegos em diretório temporário privado. Confere as duas ordens, os hashes dos recibos e o vínculo dos pixels originais, das prévias e dos pareceres ao corpus. A saída inclui as notas do juiz para a imagem aprovada, o registro de aprovação visual e os autorrelatos em campos próprios. Os textos privados e a transcrição permanecem no pacote. Use `--recorded-root` com a raiz anterior se o pacote foi movido e o corpus contém caminhos absolutos.

`executar.py` verifica a natureza do dataset antes de consultar o login do Codex. Um novo julgamento remoto de um dataset privado depende de autorização específica do criador para esse envio. A opção `--autorizar-envio-privado-ao-codex`, antes do subcomando, registra a confirmação explícita para a execução. A auditoria local dispensa essa opção e a autenticação. Trate a referência aprovada como caso de desenvolvimento e regressão. O briefing evoluiu durante a conversa, portanto a comparação entre versões permanece retrospectiva.

## Qualificação do revisor de produção

O [replay offline](reexecutar-revisor-offline.mjs) executa a composição de geração e revisão com quatro PNGs sintéticos do dataset, conferidos por hash e submetidos ao mesmo prompt. Os transportes são simulados. Rode `node scripts/evals/qualidade-criativa/reexecutar-revisor-offline.mjs`. O recibo registra o hash da configuração, os pareceres injetados e se os mesmos bytes foram liberados. A execução mede o comportamento do filtro perante as respostas injetadas.

Para testar a interpretação visual no Codex autenticado via ChatGPT, execute `python3 -B scripts/evals/qualidade-criativa/avaliar-revisor.py DIRETÓRIO-NOVO --calibrado`. A execução captura a configuração do adaptador, apresenta somente os controles sintéticos em sessões com ferramentas desabilitadas e valida os pareceres no adaptador com transporte simulado. Utilize `--reservas PACOTE-SINTÉTICO` em vez de `--calibrado` para testar os quatro PNGs de trabalhos anteriores conferidos por hashes fixos. Esse modo requer os originais no pacote local, além das prévias do relatório. A substituição do Codex pela Responses API real exige qualificação própria.

O [runner da Responses API](avaliar-revisor-api.mjs) verifica antes do envio os quatro PNGs congelados da feira e roda os seis cenários sequencialmente. `node scripts/evals/qualidade-criativa/avaliar-revisor-api.mjs --simular CAMINHO-NOVO.ndjson` exercita o caminho com transporte simulado e dispensa credencial. Para uma rodada autorizada, `--executar` lê a chave da área de transferência somente em memória, faz até seis solicitações e não repete pedidos. Use um caminho novo em `quality-results/`. A primeira rodada real registrou um escape e está documentada no [relatório](../../../docs/evals/qualidade-criativa-2026-11-18/README.md#primeira-rodada-na-responses-api-em-19112026).

1. Congele modelo, versão de instrução, schema, prazo e política de retenção antes de abrir a amostra reservada. Use imagens que representem os caminhos e formatos previstos. Inclua exemplos publicáveis e falhas materiais de tipografia, oferta, integridade visual e genericidade. Inclua contrapartes aceitáveis com surrealismo deliberado, assimetria, grão, ilustração, fotografia e estilos de densidade diferentes. Cubra ordens e nomes aleatórios e mantenha histórico vinculado à peça sem revelar origem.
2. Dois avaliadores que desconhecem a revisão do gerador, o parecer do modelo e a seleção do criador examinam cada PNG com o briefing e a prévia no formato de uso. Cada um aponta região e evidência da decisão. Uma terceira leitura adjudica discordâncias. Preserve essas discordâncias e o motivo da decisão final. Conte peças com julgamento humano inconclusivo e mantenha essa cobertura visível.
3. Avalie o componente com os mesmos dados que teria no estúdio. Confira o vínculo com os bytes que seriam liberados e rode o caminho real com as respostas de aprovação, defeito, dúvida, JSON inválido, erro e prazo vencido. Meça a proporção de peças defeituosas liberadas entre as consideradas críticas pelos humanos. Nas peças consideradas aptas, reporte rejeições indevidas e retenções totais, incluindo dúvidas e falhas técnicas. Mostre denominadores por estilo e operação, latência e custo por tentativa. Determine os limites de aceitação antes da leitura. O rastreio de qualquer escape conhecido precisa apontar o mesmo ativo e a decisão de liberação.
4. Use a peça independente como unidade de amostra. Trocar a ordem de dois pareceres dos mesmos pixels verifica estabilidade, com uma única peça no denominador. Com zero escapes em `n` peças independentes e representativas, o limite superior binomial unilateral de 95% é `1 − 0,05^(1/n)`. São necessárias 59 peças críticas independentes com zero escapes para obter limite abaixo de 5%, ou 299 para ficar abaixo de 1%. Esses números ilustram a escolha de precisão. Controles dirigidos e lotes correlacionados servem para detectar regressão e deixam a frequência de produção desconhecida. [NIST, limites binomiais exatos](https://www.itl.nist.gov/div898/software/dataplot/refman2/auxillar/exacbici.htm)
5. Antes de usar um parecer em produção, verifique a persistência e a recuperação do desfecho por operação, a retenção antes do Storage, os limites autorizados de custo e tempo e a ausência de reenvio automático. Preserve aprovação e reação do criador como medidas de produto. Um único post aprovado e as duas ordens cegas sustentam um caso de regressão, com cobertura populacional ainda em aberto.
