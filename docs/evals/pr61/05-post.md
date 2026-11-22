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

## Evolução do Marco 5 — Copy na imagem, voz e 4 modos nativos (21/11/2026)

A suíte legada (`--suite legacy`, 5 casos 4:5 em `cases.json` e `rubrica.md`) permanece intocada para preservar a comparabilidade com as rodadas R0–R3 acima. Para cobrir a curadoria de skills criativas, a skill dedicada `on-image-copy.v1`, a configuração opcional de voz da marca (`brandVoice`) e os quatro modos nativos do Instagram (`single` 4:5, `carousel` 4:5, `collection` 4:5 e `story` 9:16), foi adicionada a suíte `--suite extended`:

- **Casos e divisão:** [casos-estendidos.json](../../../scripts/evals/pr61/post/casos-estendidos.json) traz 8 casos sintéticos (5 de desenvolvimento e 3 reservados) distribuídos entre post único, carrossel (4–5 lâminas), coleção editorial (3 fotos) e story vertical 9:16 (`864x1536`), cada qual com `brandVoice` (`tone`, `examples`, `avoid`) e fatos confirmados.
- **Rubrica estendida:** [rubrica-estendida.md](../../../scripts/evals/pr61/post/rubrica-estendida.md) soma `adequacaoAoPerfil` e `sinergiaLegenda` (quando há `caption.txt`) às dimensões universais, adiciona `coesaoVisual` e `progressaoOuRitmo` para carrossel/coleção e `zonasSeguras` (painel comparativo 360 px com guia 15% topo / 25% base / 16% lateral direita) para story. O portão factual também reprova `cliche_ou_evitar`.
- **Verificação automatizada offline:** `python3 -m unittest discover -s scripts/evals/pr61/post -p "test_*.py" -v` e `node --test scripts/evals/pr61/post/run-extended.test.mjs` validam o executor, o empacotamento cego, a tira horizontal de múltiplas lâminas, o painel de zonas seguras do story, a coerência das falhas críticas e a retenção dos casos reservados sem realizar chamadas pagas.
- **Rodadas reais executadas em 22/11/2026 (cinco rodadas completas, `8` casos e `19` imagens por rodada, `95` imagens totais, `0` casos incompletos):** geradas via [run-extended.mjs](../../../scripts/evals/pr61/post/run-extended.mjs) (`gpt-6.1-terra` + `gpt-image-2.6-flare`) e julgadas em sessões cegas independentes pelo `gpt-6.2-sol` (Codex CLI `0.166.0`, `0` ferramentas; sessões `01a20303-3a68-7ab3-897a-c67c1c59c28e`, `01a20305-d2ad-74b0-bbbf-5d4a5e5000eb`, `01a20325-66e3-71d3-b54b-14b9df482e77`, `01a20331-9e31-7fc3-8633-6150c2cdfa90` e `01a203f0-9021-7ce0-aa8e-57b0abeb24aa`). PNGs e recibos individuais permanecem fora do Git em diretório privado local. [Respostas completas, divisões, hashes e uso por rodada](../../../scripts/evals/pr61/post/rodadas-estendidas-reais.json) · [ADR 0080](../../adr/0080-skills-criativas-copy-e-modos-de-post.md) · [Curadoria de skills criativas](../../creative-skills-curation.md)

| Rodada | Revisão / Catálogo | Prontas (dev) | Prontas (reserva) | Total prontas | Notas `2` (de 48) | Notas `0` | Falhas críticas | Planner (`gpt-6.1-terra`) | Imagem (`gpt-image-2.6-flare`) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **0** | `cc8e538` · `baseline` | 1 de 5 | 2 de 3 | **3 / 8** | 40 / 48 (`83,3%`) | 2 | 0 | 35.181 | 37.529 |
| **1** | `cc8e538` · `skills.v1` + Âncora | 0 de 5 | 2 de 3 | **2 / 8** | 39 / 48 (`81,3%`) | 1 | 0 | 46.880 | 63.624 |
| **2** | `e00c5fe` · `skills.v2` + prompt limpo | 3 de 5 | 1 de 3 | **4 / 8** | 42 / 48 (`87,5%`) | 1 | 1 | 72.106 | 55.214 |
| **3** | `5a156fb` · `skills.v3` (rigor numérico + Story 9:16) | 3 de 5 | 1 de 3 | **4 / 8** | 44 / 48 (`91,7%`) | 0 | 0 | 71.864 | 53.102 |
| **4** | `2c96e22` · `skills.v4` (legenda + peso + gancho) | **4 de 5** | **2 de 3** | **6 / 8** | **45 / 48 (`93,8%`)** | 1 | **0** | 49.956 | 52.921 |

| Dimensão (8 casos combinados) | R0 `baseline` `[0/1/2]` | R1 `v1` `[0/1/2]` | R2 `v2` `[0/1/2]` | R3 `v3` `[0/1/2]` | R4 `v4` `[0/1/2]` | Evolução R0 → R4 |
| --- | :---: | :---: | :---: | :---: | :---: | ---: |
| `zonasSeguras` (2 stories 9:16) | `2 / 0 / 0` | `1 / 1 / 0` | `1 / 0 / 1` | `0 / 0 / 2` | **`0 / 0 / 2`** | **`+2` (`0% → 100%`)** |
| `adequacao` (8 casos) | `0 / 2 / 6` | `0 / 3 / 5` | `0 / 2 / 6` | `0 / 0 / 8` | **`0 / 0 / 8`** | **`+2` (`75% → 100%`)** |
| `progressaoOuRitmo` (4 multi-lâmina) | `0 / 2 / 2` | `0 / 1 / 3` | `0 / 1 / 3` | `0 / 0 / 4` | **`0 / 0 / 4`** | **`+2` (`50% → 100%`)** |
| `coesaoVisual` (4 multi-lâmina) | `0 / 0 / 4` | `0 / 0 / 4` | `0 / 0 / 4` | `0 / 0 / 4` | **`0 / 0 / 4`** | `0` (`100%`) |
| `gancho` (8 casos) | `0 / 0 / 8` | `0 / 0 / 8` | `0 / 1 / 7` | `0 / 1 / 7` | **`0 / 0 / 8`** | `0` (`100%`) |
| `leitura` a 360 px (8 casos) | `0 / 1 / 7` | `0 / 3 / 5` | `0 / 1 / 7` | `0 / 1 / 7` | `0 / 1 / 7` | `0` (`+2` vs R1) |
| `sinergiaLegenda` (6 com legenda) | `0 / 1 / 5` | `0 / 0 / 6` | `0 / 0 / 6` | `0 / 2 / 4` | `0 / 1 / 5` | `0` (`+1` vs R3) |
| `adequacaoAoPerfil` (8 casos) | `0 / 0 / 8` | `0 / 0 / 8` | `0 / 0 / 8` | `0 / 0 / 8` | `1 / 0 / 7` | `-1` |

**Evolução e leitura crítica (`R0 → R1 → R2 → R3 → R4`):**
- **Ciclo 2 (`e00c5fe`, `compor-creative-skills.v2`):** corrigiu o conflito legado em `formatos-instagram@1.1.0` (*"uma única arte 4:5"*), limpou UUIDs/chaves vazias em `compileArtworkPrompt` (`-13%` tokens de imagem), vetou microtexto diegético/meias-colunas apertadas/fontes condensadas, limitou apoio de carrossel a `8–16` palavras e introduziu anatomia de Story 9:16 sem botão falso (`0/5 → 3/5` em dev).
- **Ciclo 3 (`5a156fb`, `compor-creative-skills.v3`):** desenhado apenas a partir de `round-2/judge-5-extended.json` (reserva de R2 lacrada), acrescentou rigor lógico-matemático em passos numéricos empilhados e restringiu a tipografia de Story aos dois terços esquerdos (`~68%`) com zoneamento explícito da cena fora da faixa de pouso da figurinha (`~60%–74%`). Resultado: `zonasSeguras` **`2/2`**, `adequacao` **`8/8`**, `progressaoOuRitmo` **`4/4`**, `0` notas `0` e `0` falhas críticas (`44/48` notas `2`).
- **Ciclo 4 (`2c96e22`, `compor-creative-skills.v4`):** preservou integralmente a geometria 9:16 e o rigor numérico de `v3`, adicionando regra anti-resumo-espelho na legenda de post único, distinção de peso tipográfico (`bold` na manchete vs `regular` arejado no apoio, `≤ 10` palavras quando a lâmina acumula diagrama + apoio + CTA) e veto a rótulos genéricos de status (`"Carrinho aberto"`, `"Inscrições abertas"`) como manchete principal. Resultado: **`6/8` peças prontas (`75%`, o dobro do baseline `3/8`!)** e **`45/48` notas `2` (`93,8%`)** com **`0` falhas críticas** — **`2/2` carrosséis prontos (`enem` e `ux`)**, **`2/2` stories 9:16 prontos (`oficina` e `lancamento`)**, **`1/2` post único (`cafe`)** e **`1/2` coleção (`padaria`)**, reduzindo ainda o consumo do planejador de `71.864` para `49.956` tokens.
- **Nota de protocolo:** os três casos reservados de `casos-estendidos.json` foram expostos após R0 vs R1 e novamente após R3 (`report.py --rounds 4`); portanto, a Rodada 4 (`v4`) funciona como **rodada de consolidação pós-inspeção** sobre a bancada fixa. Qualquer confirmação estatística cega futura deve introduzir novos casos reservados inéditos.
