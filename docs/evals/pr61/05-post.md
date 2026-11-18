# Marco 5 — A pessoa quer usar esta versão?

**Baseline de 17/11/2026, PR #61 em `8817f57`.** O resultado esperado é que a pessoa veja valor em usar a versão que tem em mãos e consiga explorar outras direções sem perder as anteriores. Há três perguntas diferentes: empolga? Serve ao objetivo que defini? Quero usar esta versão? Uma quarta pergunta, depois de um uso efetivo, verifica o resultado observado.

## Entrada e saída

Receber do marco 4 a direção, as restrições conservadas, a dimensão que a pessoa quis variar e o motivo do último ajuste quando declarado. Associar o julgamento à imagem entregue **e** à sua legenda, com a identificação da versão ou do rascunho específico. Preservar peça, versão-base, variante e revisão da avaliação. Uma mudança de direção abre outro ramo. Continuar explorando ou aprovar outra versão deixa em aberto se a pessoa também usaria a anterior.

O retorno ao ciclo deve identificar **o que preservar** e **o que revisar**, com a origem da avaliação. Um preço errado remete ao briefing e à criação da peça. Uma referência útil perdeu seu atributo no resultado? Investigar a triagem e os anexos. Uma versão é interessante mas apenas repete a anterior? Investigar o plano e as propostas do lote. Uma reação sem motivo permanece sem atribuição de causa. [Feedback e evolução](../../adr/0006-feedback-e-evolucao-do-harness.md)

## Métricas humanas propostas

A unidade é a **versão efetivamente apresentada**. Contar uma vez cada versão por pessoa e item respondido, mantendo a última revisão da resposta. Separar projeto, peça e ramo no cálculo autorizado. Publicar cobertura de exposição e resposta por pergunta. Reportar também a média das taxas por peça para que uma peça com muitas variações não domine o resultado.

| Sinal | Como medir | Régua inicial para o piloto |
|---|---|---|
| Empolgação | Respostas 4 ou 5 à pergunta “De 1 a 5, quanto esta versão te empolga?” ÷ respostas válidas para a versão. Âncoras 1 = nenhuma, 3 = moderada, 5 = muita. | Hipótese de 80% de notas 4–5. |
| Expectativa de sucesso | Respostas 4 ou 5 a “Se publicasse esta versão, quão confiante está de que ela alcançaria seu objetivo de [objetivo declarado]?” ÷ respostas válidas. Oferecer “ainda não sei”. | Hipótese de 80% de notas 4–5 entre quem avaliou; apresentar o número de indecisos e a cobertura sobre todos os convidados. |
| Intenção de uso | “Quero usar esta versão”, inclusive “quero usá-la e explorar outra”, ÷ respostas válidas à escolha. Oferecer também “só depois de um ajuste”, “não pretendo usar” e “ainda não sei”. As duas formas de intenção afirmativa contam uma única vez. | Hipótese de 80% com intenção afirmativa. |
| Todas as versões utilizáveis | Peças cujas versões apresentadas têm, cada uma, as três respostas favoráveis ÷ peças com avaliação completa. Reportar também peças com uma negativa conhecida e peças com desfecho parcial/desconhecido entre **todas** as elegíveis. | Objetivo ideal de todas as versões favoráveis; ensaio inicial descritivo, publicar distribuição por peça e ramo antes de fixar a taxa. |
| Uso e resultado posteriores | Convite opcional e autorizado com versão e janela declaradas. Registrar se a pessoa compartilhou e se obteve o objetivo pretendido. Mostrar separadamente compartilhamentos confirmados, não compartilhamentos declarados e desconhecidos, e os resultados confirmados entre as peças utilizadas. | Medir em janela combinada com a pessoa. Cada resultado tem fonte, janela e denominador; a expectativa inicial não permite estimar alcance ou conversão. |

Os limiares de 80% são hipóteses, ainda sem calibração com pessoas. Se o denominador é zero, a taxa é **indisponível**. Respostas faltantes, “ainda não sei”, tarefas em andamento e recusas de participação exigem contagens separadas. A coleta seria voluntária, amostrada e sujeita à finalidade autorizada. Salvar, aprovação explícita, aprovação herdada, download e publicação permanecem eventos separados. O primeiro é evidência de persistência e o último depende de observação própria.

## Eval LLM executada

Um avaliador Codex GPT-6 deste trabalho abriu individualmente os **dez PNGs de 360 px** e leu suas dez legendas do pacote cego P02 nos cenários [Volta de Pote](../../../prototypes/compor-mcp/evals/model-efficiency/blind/round1-startup/P02/package.json) e [Trama de Aula](../../../prototypes/compor-mcp/evals/model-efficiency/blind/round1-mentoria/P02/package.json). Cada trajetória contém duas direções D1/D2, duas variações V1/V2 no primeiro conceito e um ajuste R1 da V1. Foram inspecionados arquivos locais de uma geração histórica do **protótipo**, sem consulta às notas de outros juízes, sem expor a identidade do candidato e sem chamadas pagas. O caso e o papel de cada versão eram conhecidos. O avaliador definiu esta régua exploratória na mesma sessão; este material não é uma amostra reservada.

A rubrica examina sinais observáveis que poderiam ajudar a pessoa a usar a peça. Em cada dimensão, 0 significa ausente, contraditório ou ilegível. Um erro em fato obrigatório torna a versão inelegível.

- **Gancho (G).** 1 apresenta uma ideia genérica recuperável pela legenda ou pelo texto de apoio; 2 conecta título e imagem a uma situação, desejo ou metáfora específica do público.
- **Leitura (L).** 1 exige esforço para ler o motivo de interesse ou o próximo passo a 360 px; 2 estabelece hierarquia e permite recuperar os dois sem esforço relevante no feed.
- **Ação e fidelidade (A).** 1 alude à ação, mas a pessoa precisa inferir o próximo passo ou resolver uma ambiguidade entre arte e legenda; 2 oferece um próximo passo inequívoco alinhado à oferta, sem inventar uma condição.
- **Proxy de prontidão.** Uma versão atende quando G, L e A valem 2 e a verificação dos fatos está satisfeita. Em experimentos posteriores, este proxy serve para localizar regressões. Ele não responde às três perguntas humanas.

| Caso/arte | G/L/A | Evidência que determinou a leitura |
|---|---|---|
| Volta D1 | 2/2/2 | “Com quem estão seus potes?” associa a fileira de recipientes a uma dúvida do produtor. A faixa “Conheça uma demonstração” dá o próximo passo. |
| Volta D2 | 1/2/2 | As mãos, setas e o caminho de volta ilustram a circulação. A função distintiva da ferramenta só fica clara no texto lateral; funções e convite estão legíveis. |
| Volta V1 | 2/1/2 | A pergunta nomeia os clientes. Junto aos potes, “Consulte na Volta de Pote” é legível, mas a linha de funções e a explicação de público ficam diminutas acima do CTA. |
| Volta V2 | 2/1/2 | Potes em primeiro plano e “quais potes ainda estão com seus clientes” tornam a situação concreta. O bloco inferior de funções perde leitura pelo tamanho no feed. |
| Volta R1 | 2/1/2 | A pergunta ganha escala e muda de quebra. A informação funcional sob os potes conserva o tamanho pequeno e o convite à demonstração continua claro. |
| Trama D1 | 1/1/2 | O percurso de pontos reforça a ideia de ensinar, mas o título interpela de modo amplo. A mecânica da oferta e o CTA têm pouca escala ao pé da composição. |
| Trama D2 | 2/2/2 | “Seu saber pode ganhar forma de curso” ganha forma nos fios tecidos. O bloco roxo identifica quatro encontros, revisão e o CTA “Envie TRAMA por mensagem”. |
| Trama V1 | 2/1/2 | A pergunta liga o conhecimento da pessoa ao preparo de seu curso. Os quatro encontros e a instrução de mensagem disputam leitura em linhas pequenas no rodapé. |
| Trama V2 | 2/2/2 | “O que você quer ensinar no seu primeiro curso?” explicita a tarefa. O apoio sobre a mentoria e o bloco dos encontros têm hierarquia clara; a legenda repete o CTA. |
| Trama R1 | 2/1/2 | A headline reduzida em três linhas atende à solicitação de escalar o título para baixo. O apoio e a chamada continuam pequenos a 360 px. |

**Resultado.** 3/10 versões atendem à régua estrita, 1/5 em Volta de Pote e 2/5 em Trama de Aula. São duas trajetórias correlacionadas. 10/10 comunicam ação fiel; 8/10 recebem gancho 2 e 4/10, leitura 2. Nenhuma das duas trajetórias tem todas as cinco imagens acima da régua. Cobertura humana sobre os três sinais: **0/10 versões**. Cobertura do fluxo visual atual da web nesta amostra de pixels: **0/10**. Os pedidos de ajuste roteirizados ocorreram **antes** da revisão final; não representam a reação a R1.

Reproduzir a identidade dos insumos no commit `8817f57d44b9d9f9339d59791c6b7cf0397d7c68` usando o caminho `prototypes/compor-mcp/evals/model-efficiency/blind/round1-{startup,mentoria}/P02` e a ordem em `package.json → stages → artifacts`. SHA-256 da concatenação dos bytes UTF-8 de `id + "\n" + caption + "\n"` e dos bytes do `preview_360` para cada arte: Volta `9771a366bf9d912bf5963cc2eb52c8a6cca807ecc6f40e8f430f412cf7301f88`; Trama `a4479f47d7b3eface8533ded32f8d93136d5194914944faca171a6d3a339f935`.

## Evidência de execução da web

Na raiz, `node --test scripts/quality/variant-metadata.test.mjs` passou (1/1). O teste PGlite aplica as migrations pertinentes e verifica versão-base, variante nova sem aprovação, retoque com aprovação herdada e restrições de escrita. Em `apps/web`, `node --import tsx --test test/version-metadata-http.test.mjs test/studio-variants.test.mjs` passou (8/8). Exercita o adaptador HTTP com respostas simuladas e o agrupamento real por linhagem. O caminho de revisão cria o PNG e inicia um download no navegador. [Teste de versões no banco](../../../scripts/quality/variant-metadata.test.mjs) · [Adaptador de versões](../../../apps/web/lib/piece-store.ts) · [Revisão e download](../../../apps/web/app/studio-review.tsx)

**Próxima comparação.** Fixar a régua e os casos separados antes de gerar a candidata. Comparar as duas revisões no mesmo briefing e direção, com as variantes em ordem aleatória e os avaliadores cegos para tratamento e autoria. Julgar fatos, leitura e CTA antes de revelar a identidade da revisão. Pedir às pessoas que avaliem separadamente empolgação, confiança e uso, inclusive quando quiserem explorar. Medir concordância humano–juiz em versões autorizadas e reportar discordâncias; promover somente com evidência compatível com a afirmação feita.


## Quatro rodadas em cinco casos por grupo

O juiz observou três propostas de cada briefing a 360 px e registrou fatos e falhas por arte. Nas três primeiras rodadas havia 15 artes por grupo. Na última, o planejador repetiu o contraste nas posições 1 e 3 do primeiro caso. A validação impediu o envio desse lote ao GPT Image. As três posições continuam no denominador da tarefa e têm abstenção no julgamento visual.

| Rodada | Prontas no desenvolvimento | Prontas nos dois casos de reserva | Falhas factuais críticas na reserva | Sem pixels |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 7 de 9 | 3 de 6 | 2 | 0 |
| Ciclo 1 | 3 de 9 | 3 de 6 | 0 | 0 |
| Ciclo 2 | 8 de 9 | 3 de 6 | 2 | 0 |
| Ciclo 3 | 6 de 6 observadas | 5 de 6 | 0 | 3 |

A última instrução produziu mais artes prontas na reserva de dois briefings. A decisão sobre o planejador também exige lotes utilizáveis e fidelidade às referências. Essa candidata perdeu um lote e teve pior resultado de fidelidade nos pixels reservados. O estúdio conserva a instrução de controle. O ensaio avaliou os pixels compartilhados pela exploração, sem produzir legenda nem colher intenção de publicação. [Respostas por arte e por caso, divisões e hashes](../../../scripts/evals/pr61/post/rodadas-reais.json)
