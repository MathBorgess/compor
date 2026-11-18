# Etapa 2 — ajudar a escolher referências úteis

A etapa recebe a ideia inicial ou a mensagem do post, o histórico elegível da conta e as decisões vigentes do projeto. A saída para a etapa 3 é a seleção explícita da pessoa, com origem e escopo. Mostrar um card, abrir sua prévia e escolher uma referência são eventos diferentes. Só a escolha, acompanhada da autorização prevista para o pedido, a torna candidata à triagem. [Busca do estúdio](../../../apps/web/lib/reference-exploration.ts) · [Seleção e grupos na tela](../../../apps/web/app/reference-exploration.tsx) · [Decisão sobre histórico e consentimento](../../adr/0037-referencias-sugeridas-e-retorno-ao-post.md)

## Definição de sucesso na experiência

A pergunta é se a pessoa encontra referências que quer levar ao post e consegue avançar com menos pedidos de propostas. A unidade é uma jornada de criação de post com intenção declarada de buscar referências. A vitrine pode ser visitada mais de uma vez no mesmo post. Agrupar os eventos por jornada e revisão do ranking, da primeira busca até a saída para o post, encerramento explícito ou fim da janela registrada. Para um piloto, propomos pré-fixar uma janela de 24 horas e reportar à parte jornadas ainda abertas. A publicação de taxas de uso depende de observação autorizada para avaliação.

| Métrica | Como calcular e interpretar |
|---|---|
| Referências levadas ao post | Somar os IDs únicos escolhidos que ainda fazem parte da seleção ao continuar. Dividir por todas as jornadas elegíveis da mesma coorte. Reportar também a distribuição de zero, uma e várias escolhas. Um clique desfeito não conta duas vezes. Para jornadas com desfecho desconhecido, reportar a cobertura e o intervalo compatível com o desconhecido, sem atribuir zero. |
| Pedidos adicionais e avanço | Medir o número de gestos explícitos para pedir propostas após a primeira exposição por jornada elegível com acompanhamento completo. Exibir também a proporção que chega ao post com alguma referência escolhida e nenhum pedido adicional. Contar um pedido, mesmo quando resulta em três imagens ou reconsulta ao recibo. Separar o caminho de exploração voluntária quando a pessoa declara querer mais opções. |
| Exposição e cobertura | Registrar em um piloto o número de IDs distintos efetivamente visíveis por jornada e grupo, deduplicando rolagem e recarga. Dividir escolhas por itens vistos apenas quando a exposição está disponível. Exibir ao lado jornadas iniciadas, fontes consentidas, cards exibidos, buscas vazias, indisponíveis, saídas explícitas sem referências e desfechos desconhecidos. `total_impressions` da afinidade resume decisões de escolher/recusar cada pin. |
| Proteções | Comparar taxas de avanço ao post, recusa, seleção desfeita e abandono observado. Manter disponível o caminho sem referências. A preferência por pedir menos propostas vale para quem pretendia encontrar referências prontas. Separar históricos vazios/longos, intenção de explorar, posição na vitrine e fonte na análise. |

A hipótese de promoção entre revisões é aumento de escolhas mantidas por jornada e redução dos pedidos extras, com avanço ao post pelo menos preservado entre coortes comparáveis. Congelar janela, unidade, diferença mínima de interesse, amostra e critério de incerteza com o piloto antes da comparação. Os indicadores humanos ficam sem baseline quantitativa até que escolhas, exposições e desfechos sejam observados em conjunto.

## Baseline executada no PR 61

Revisão inicial `8817f57d44b9d9f9339d59791c6b7cf0397d7c68`, Node 24.16.0. O [ensaio](../../../scripts/evals/pr61/referencias/baseline.mjs) chama a implementação web de `searchReferences` com sete [casos sintéticos](../../../scripts/evals/pr61/referencias/cases.mjs). O roteiro Phoenix, o ranking, o parsing do RSS e a exclusão por recusa são código do produto. O transporte lê XML local em memória. Para medir a seção de descoberta, o ensaio aplica a mesma exclusão de origens presentes no histórico carregado usada pelo componente. Os títulos e papéis esperados foram fixados antes da execução. A métrica offline é o total de títulos adequados entre os quatro primeiros lugares de descoberta. Nos cinco casos com quatro itens úteis disponíveis, posições não preenchidas valem zero. A janela de quatro é a unidade do ensaio e não representa um viewport medido.

```sh
node scripts/evals/pr61/referencias/baseline.mjs
```

| Caso | IDs do grupo de descoberta nos quatro primeiros lugares | Úteis pelo gabarito | Evidência |
|---|---|---|---|
| R1 • primeira visita, oficina de cerâmica | 114, 111, 113, 112 | 4/4 | Horários, gesto e materiais oferecem funções distintas. |
| R2 • anúncio de arte em ateliê | 211, 213, 214, 212 | 0/4 | “arte” em “descarte” e termos como “para” e “com” dão precedência a resíduos, transporte e indústria. |
| R3 • perfil com escolhas anteriores | 312, 314, 315, 313 | 4/4 | O board escolhido previamente aparece, e o artigo neon explicitamente recusado fica fora dos quatro resultados. |
| R4 • doze escolhas antigas de outro tema | Nenhum | 0/4 | O limite de 12 é preenchido por histórico, depois filtrado da seção de sugestões pela ideia. O RSS retornava seis pins da oficina, sendo quatro úteis. |
| R5 • retenção B2B, LinkedIn | 511, 512, 513, 515 | 3/4 | O roteiro consultou o board de infográficos. Um cartaz de festival superou o gráfico de churn. |
| R6 • feeds vazios | Nenhum | Não aplicável | Estado `empty`. |
| R7 • feeds indisponíveis | Nenhum | Não aplicável | Estado `unavailable`. |

**Resultado.** Nos cinco casos elegíveis, 11 de 20 lugares receberam referências úteis pelo gabarito. A seção retornou 16 candidatos nos primeiros quatro lugares somados. Dos 16, 11 eram úteis. Quatro de cinco casos retornaram pelo menos uma sugestão nova e três de cinco retornaram pelo menos uma útil nos primeiros quatro. Os dois controles distinguiram vazio e falha da fonte. Nenhum desses números corresponde a pessoas que escolheram ou pediram outra proposta.

## Julgamento por LLM e calibração

Aplicação exploratória por um agente Codex no chat aos **títulos retornados**. Unidade: card e pedido sintético. Rubrica: 2 quando o título sustenta uma função visual ou informacional específica do pedido, 1 para vínculo indireto justificável, 0 para irrelevância ou incompatibilidade, e abstenção quando o aspecto solicitado exige pixels. O avaliador teve acesso aos casos e à ordem. A leitura abaixo é uma primeira avaliação editorial com viés de autoria e deve ser calibrada de forma independente antes de orientar promoção.

| Caso | Notas do juiz na ordem real dos cards | Justificativa |
|---|---|---|
| R1 | 2, 2, 2, 2 | A hierarquia de horários dá uma contribuição de organização expressamente pedida. As outras cobrem produção, modelagem e esmaltação. |
| R2 | 0, 0, 0, 0 | Nenhum título fornece indicação de obra, ateliê, artista, catálogo ou processo artesanal. |
| R3 | 2, 2, 1, 2 | O aquecimento com pincel é uma referência de técnica aproveitável. O título dá pouca evidência de hierarquia ou ritmo de cartaz. |
| R4 | Sem card avaliável | Ausência da região de descoberta é uma falha mensurável de cobertura neste caso. |
| R5 | 2, 2, 2, 0 | Coortes, evolução e comparação temporal atendem ao papel pedido. O convite decorativo não comunica retenção. |

O juiz identificou 10 papéis diretamente justificados entre 16 títulos apresentados, um indireto e cinco irrelevantes. Aparência nos pixels, gosto pessoal, escolhas e pedidos extras permanecem desconhecidos. Para uma comparação cega, fixar os casos antes de mudar o algoritmo, reservar novos casos, embaralhar as revisões e posições para o juiz, ocultar gabarito, contagens e nome do motor, e avaliar cada card individualmente com trecho de evidência. Só depois restaurar a posição e calcular a cobertura do top‑4. Registrar julgador/revisão da rubrica e calibrar divergências contra avaliações humanas consentidas. Em um piloto com imagens autorizadas, o juiz pode ler os pixels e a direção do briefing separadamente dos metadados.

## Ciclo candidato

A primeira melhoria proposta preserva os grupos históricos e reserva espaço para pins novos quando o histórico enche a janela. No R4, a condição mínima é conservar as 12 escolhas anteriores nos grupos de histórico e oferecer os quatro itens pertinentes entre os primeiros quatro de descoberta. A segunda hipótese, independente, é ranquear títulos por termos de conteúdo completos para eliminar colisões como “arte” e “descarte”. Avaliar uma mudança por vez, repetir controles de recusa/vazio/indisponibilidade e examinar novos casos de perfil e intenção antes da promoção. Mais itens pertinentes recuperados permitem uma comparação do ranking. A eficácia percebida requer as observações de produto definidas acima.

### Experimento isolado de descoberta, sem promoção nesta rodada

Matheus escolheu a etapa 3 para o ciclo deste PR. A candidata da etapa 2 ficou preservada apenas na branch local `experiment/pr61-isolated-reference-discovery`, revisão `c61cd24aa0cce8cfe199e53bea35a943db4c252c`. O experimento reservou espaço próprio para a descoberta e conservou o contrato combinado para clientes existentes. Um oitavo caso (R8) foi congelado antes da alteração em código de produção. Traz uma oficina de xilogravura, 15 referências históricas, um pin do histórico repetido no feed, um pin recusado e quatro títulos pertinentes. O arquivo de casos incluído no ensaio tem SHA-256 `5a246c1c5e5f1e95822ac38cab478b8746834dae31b8a2141d7dd4d22e211d8e`.

| Condição | Primeira execução em 8817f57 | Candidata de descoberta |
|---|---|---|
| R4, 12 escolhas históricas | 0/4 títulos pertinentes | 4/4, IDs 111, 113, 114, 112 |
| R8 reservado, 15 escolhas históricas, recusa e duplicata | 0/4 títulos pertinentes | 4/4, IDs 921, 922, 923, 924 |
| R1, R2, R3 e R5 | 4/4, 0/4, 4/4 e 3/4 | Mesmos resultados e ordem |
| R6 e R7 | Vazio e indisponível | Mesmos estados |
| Cinco casos elegíveis originais | 11/20 lugares úteis | 15/20 lugares úteis |
| Seis casos elegíveis incluindo o reservado | 11/24 lugares úteis | 19/24 lugares úteis |

A comparação foi feita no mesmo host, contra a mesma cópia sintética dos feeds. O comando `node scripts/evals/pr61/referencias/baseline.mjs` no PR reproduz as oito linhas da revisão inicial (SHA-256 `b241cf82355fa66160df52855f7ce13885f52d7571a97cfd898c2218dd996029`). Na revisão isolada, o argumento `discovery` exercita a candidata e `combined` conserva o controle. Os testes executados nessa revisão isolada cobriram 11 pins históricos aprovados, uma escolha anterior e quatro novas sugestões no Chromium, além do teto de 12 novas na rota, com recusa e duplicatas excluídas. Os resultados da coluna da candidata pertencem ao experimento local.

A melhora medida é cobertura de sugestões pertinentes, pelos títulos de fixtures sintéticas. O cenário de falsa semelhança lexical continua com 0/4. O efeito sobre escolha, intenção e pedidos adicionais por pessoa permanece em aberto.


## Avaliação agrupada de 18/11/2026

Rodamos cinco buscas de descoberta por rodada. Três casos de desenvolvimento retomam a oficina de cerâmica, a colisão lexical entre “arte” e “descarte” e a oficina com histórico cheio. Dois casos novos ficam reservados até a análise final. Um pede conserto de bicicleta com uma recusa registrada. O outro pede troca de sementes com duplicata no histórico. Todos usam metadados sintéticos de RSS, origem permitida, leitura limitada e parser/ranking do estúdio. Os adaptadores devolvem exclusivamente fixtures. Os quatro primeiros lugares seguem a seleção exibida pela região de sugestões da interface. A disponibilidade de cada board faz parte do resultado. Uma busca separada em cada rodada pode devolver a mesma ordem por ser determinística.

O juiz recebe pedido, finalidade e até quatro títulos e fontes realmente retornados. Cada espaço vale um ponto se o título sustentar diretamente o pedido. Ausência e irrelevância valem zero. Calculamos casos com ao menos três lugares pertinentes / cinco e total de lugares pertinentes / 20. A ausência de duplicatas e recusas entre sugestões é verificada pelo executor em cada caso. Violações impedem promoção. A pertinência avaliada é do metadado. Pixels, decisão de seleção e satisfação das pessoas continuam sem medida.

O conjunto foi congelado em `dbc5718`. SHA-256 do conteúdo serializado dos casos: `cfa0bc29a6686e5ca1361d2035e099006b30428fd80cbd55a0d2787f60ee19fd`. O executor e as duas novas fixtures estão em [referências](../../../scripts/evals/pr61/referencias/).

### Parecer por caso e decisão

| Caso · lugares pertinentes entre quatro | Base | Ciclo 1 | Ciclo 2 | Ciclo 3 |
| --- | ---: | ---: | ---: | ---: |
| R1 · oficina de cerâmica | 2 | 3 | 3 | 3 |
| R2 · fotografar a obra no ateliê | 0 | 4 | 3 | 4 |
| R4 · oficina com histórico cheio | 0 | 0 | 2 | 2 |
| R9 · reparo de freio, reservado | 0 | 0 | 0 | 0 |
| R10 · biblioteca de sementes, reservado | 4 | 4 | 4 | 4 |
| **Lugares pertinentes / 20** | **6** | **11** | **12** | **13** |
| **Casos aprovados / 5** | **1** | **3** | **3** | **3** |
| **Lugares com cartão / 20** | **12** | **12** | **16** | **16** |

| Parecer de desenvolvimento que motivou a decisão | Mudança submetida ao próximo juiz | Resultado observado |
| --- | --- | --- |
| Base · R2 apresentou quatro cartões de indústria e descarte para um pedido de fotografia de arte. | Ciclo 1, `d313c73`. O ranking compara palavras de conteúdo inteiras, normaliza acentos e ignora preposições e conectivos frequentes. | Os quatro títulos irrelevantes saíram do top‑4. Voltaram luz de janela, ateliê, textura e narrativa no estúdio. |
| Ciclo 1 · R4 seguiu sem sugestões porque o retorno de doze itens foi todo ocupado pelo histórico. | Ciclo 2, `e4ce13b`. A tela pede `discoveryOnly`. A busca exclui o histórico e recusas antes de limitar a lista. A opção é facultativa e o consumidor legado mantém a ordem histórica. | R4 passou de zero para quatro cartões. Dois títulos sustentam diretamente a modelagem em argila. Os outros tratam de esmaltação e horários sem indicar o assunto. O teste de rota preserva consentimento, propriedade, recusa e deduplicação. |
| Ciclo 2 · R4 recebeu dois títulos de pertinência insuficiente. | Ciclo 3, `15ba9ed`. Havendo títulos com sobreposição lexical, a descoberta removeu os restantes. Sem nenhum título correspondente, conservou o conjunto do board. | As cinco listas permaneceram idênticas às do ciclo 2, em IDs e ordem. No controle contrastante, a regra removeu “Da roda à queima da argila” quando a consulta era “Cerâmica”. |

**Decisão local.** Conservamos a correspondência por palavra e a descoberta separada do ciclo 2. Rejeitamos a poda do terceiro ciclo. O aparente ganho de 12 para 13 lugares vem de juízes diferentes discordarem sobre o mesmo título de retratos com luz de janela. O efeito observado da descoberta separada foi recuperar quatro lugares antes ocupados pelo histórico; preencher os quatro não garante quatro referências pertinentes. O caso reservado de bicicleta ficou vazio nas quatro buscas. Os boards escolhidos pelo roteador não ofereciam itens na fixture. Nenhuma revisão foi ajustada a partir dos pareceres reservados. Avaliar cobertura de fontes e paráfrases exige uma nova amostra pré-fixada; o resultado atual não estabelece aprovação global.

Cada rodada executou cinco buscas independentes contra a mesma cópia sintética de RSS e recebeu um parecer em uma sessão exclusiva de `gpt-6.2-sol`, esforço médio e zero chamadas de ferramenta. A busca é determinística. A recusa do caso de bicicleta foi reforçada por um teste separado em que a referência efetivamente chega via RSS. Nenhuma imagem foi baixada. O próximo marco recebe somente referências efetivamente selecionadas. A melhora na ordenação não concede autorização para a geração. Os arquivos preservam entradas sintéticas, boards consultados, IDs e títulos realmente exibidos e o parecer de cada lugar. [Base](../../../scripts/evals/pr61/referencias/runs/r0.json) · [Ciclo 1](../../../scripts/evals/pr61/referencias/runs/r1.json) · [Ciclo 2](../../../scripts/evals/pr61/referencias/runs/r2.json) · [Ciclo 3](../../../scripts/evals/pr61/referencias/runs/r3.json)

Para reproduzir, entre em `apps/web` e execute `node --import tsx ../../scripts/evals/pr61/referencias/group.mjs /tmp/compor-referencias-novo --count 5`. O destino deve ser novo. O padrão usa os cinco casos. Com três ou quatro, o grupo mantém os dois reservados e os primeiros um ou dois casos de desenvolvimento. Entregue somente o conteúdo de `blind.json`, com nome aleatório, ao juiz mantido em `scripts/evals/pr61/grupos/juiz-texto.py`. A partir da raiz, execute `python3 scripts/evals/pr61/grupos/juiz-texto.py <cópia-do-pacote>`; o executor de busca mantém os IDs de casos separados no arquivo privado. Todas as medições acima usaram cinco.
