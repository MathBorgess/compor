# Etapa 4 — Variação dentro do lote e aproximação após feedback

**Pergunta.** Mantendo a direção que escolhi, consigo distinguir três maneiras de realizar a peça? Quando explico o que me falta, o próximo lote fica mais próximo do que imaginei?

**Unidade.** Um lote é uma realização de um plano com três posições. A aproximação exige dois lotes da mesma tarefa, uma manifestação explícita entre eles e a parte da direção que a pessoa quis manter. Um pedido deliberado de trocar de direção abre outra comparação. Selecionar por si só não diz se a razão foi a paleta, a tipografia ou o assunto.

## Critérios e passagem de uma etapa à outra

| Medida | Denominador e evidência | Hipótese de sucesso |
|---|---|---|
| Diversidade percebida dentro do lote | Por lote completo, avaliar os três pares (1–2, 1–3, 2–3). Mostrar quantos são distintos e preservam a direção. No produto, a própria pessoa pode indicar quais opções lhe parecem realmente diferentes. | Os três pares oferecem escolhas reconhecíveis segundo a pessoa. A identidade e os fatos exigidos permanecem em todas as propostas. Relatar também a distribuição de 0 a 3 e a cobertura de pessoas que responderam. |
| Aproximação entre lotes | Comparações com feedback aplicável e direção estável. A pessoa aponta qual lote está mais próximo da peça que queria, ou responde “iguais”, “nenhum” ou “não sei”. Comparar antes e depois do mesmo objetivo. | A pessoa prefere o lote posterior pelo aspecto que pediu e reconhece o que queria preservar. Em comparação de versões da skill, observar melhora sobre a baseline no mesmo conjunto de casos, com desconhecidos e regressões visíveis. |
| Fidelidade da mudança ao feedback | Na avaliação controlada, contar aspectos atendidos entre os pedidos verificáveis e verificar separadamente as restrições preservadas. | A alteração melhora o aspecto apontado e preserva todos os obrigatórios. Alterar os fatos da oferta, ignorar a identidade pedida ou aplicar feedback de outra peça impede promover a candidata. |

A etapa 3 fornece a direção atual, os fatos e o conjunto de referências triado. O planejamento aceita critérios adotados e recusados e os últimos sinais elegíveis. O avaliador recebe a intenção explicitada e identifica o que deve **ficar** e o que pode **variar**. Na saída, a etapa 5 recebe a alternativa e sua origem, a versão de partida, as restrições conservadas e os comentários com escopo na peça. Entusiasmo e vontade de usar cada variante são avaliados na etapa 5. Explorar outra direção por curiosidade não invalida uma que a pessoa quis usar. [Contexto de planejamento](../../../apps/web/lib/parallel-exploration-context.ts) · [Sinais de imagens geradas](../../../apps/web/lib/generated-feedback-contract.ts)

## Protocolo do juiz

O juiz recebe as imagens na dimensão de leitura, o briefing, as restrições e, na comparação entre rodadas, o feedback conhecido antes da geração seguinte. A posição A/B é permutada independentemente por par. O pacote oculta gerador, versão da skill e ordem cronológica. Para cada par o juiz registra evidência visual verificável e pode declarar insuficiência de pixels. A rubrica é:

- **0** corresponde à mesma execução ou troca apenas de palavras/cor. **1** corresponde a tratamento identificável mantendo o mesmo foco e a mesma leitura principal. **2** exige uma escolha de execução visivelmente distinta pela hierarquia, recorte, foco ou percurso de leitura. Uma mudança defendida apenas pela redação dos prompts recebe zero crédito visual.
- Aderência à direção e aos fatos é uma condição separada. Uma variação que chama atenção porque passou a vender outro produto perde o critério.
- Para aproximação, escolher A, B ou empate conforme a crítica literal e declarar preservação dos atributos fixos. Revelar a cronologia somente depois. Quando a trajetória é um lote completo, avaliar todas as imagens e apresentar também o lote inteiro à pessoa.
- Calibrar a avaliação em casos independentes com respostas de pessoas antes de interpretar a preferência do juiz como previsão. Registrar cobertura, divergências, origem do julgamento e tarefas com saída parcial. Não repetir geração com resultado incerto para preencher lacunas.

## Baseline executada no PR

Revisão do estúdio `8817f57d44b9d9f9339d59791c6b7cf0397d7c68`. Exercitamos o contexto real por chamada local com um comentário e respostas HTTP sintéticas. **1/1 comentário** chegou com composição e contraste preservados. O validador rejeitou **1/1 plano de cópias idênticas** e aceitou **1/1 plano semanticamente repetido**, cujos únicos diferenciais eram os sufixos “1”, “2” e “3”. Este controle localiza uma lacuna de avaliação semântica. Ele não foi produzido pelo modelo. Nenhum lote real do GPT Image ou resposta humana desta revisão foi observado nesta avaliação. [Validador exercitado](../../../packages/agents-api/src/exploration-plan-contract.mjs)

**Baseline visual auxiliar.** Um juiz LLM no Codex inspecionou os PNGs a 360 px de P01 e P02, os dois primeiros pacotes cegos de cada um dos dois cenários históricos da primeira rodada. O protocolo do protótipo solicitava duas variantes da primeira direção usando o mesmo ativo e, depois, uma revisão localizada no título. A seleção manteve um par sem revisão visual disponível. São quatro trajetórias de **dois briefings sintéticos**, com arquitetura e cardinalidade diferentes das do estúdio. O juiz avaliou variação antes de aproximação e pode reconhecer pixels compartilhados entre as duas tarefas. A avaliação tem um juiz, sem calibração humana nesta rodada. [Protocolo do corpus](../model-efficiency/protocol.md) · [Julgamentos por par com hashes](../../../scripts/evals/pr61/variacoes/julgamentos.json)

| Cenário e pacote | Variantes da mesma direção | Revisão localizada após crítica explícita |
|---|---|---|
| Mentoria P01 | 2. O tecido passa de apoio pequeno da pergunta para protagonista em uma coluna. | Aproximação. A redução do título para duas linhas diminui a disputa com a imagem. |
| Mentoria P02 | 1. Ambas abrem com título e diagrama horizontal. Muda a ordem do apoio e a área da faixa. | Aproximação. Título menor e mais estreito, com o mesmo diagrama. |
| Startup P01 | 1. A entrega do pote continua no centro. O apoio muda de posição e aparece uma tarja. | Desconhecida. O arquivo de revisão a 360 px está ausente no pacote. |
| Startup P02 | 2. Uma peça abre pela sequência de potes. A outra abre pela pergunta e usa a imagem no meio. | Aproximação. Título ampliado com nova quebra, mesmos potes e chamada. |

**Resultado.** Houve diversidade visível com direção preservada em **2/4 pares**. A revisão foi preferida em **3/3 comparações observáveis**, com cobertura **3/4** e um resultado desconhecido. O segundo número mede uma edição com pedido verificável. A sensação humana de aproximação entre lotes completos permanece desconhecida. Uma confirmação técnica dos três recibos mede execução e conserva seu próprio denominador.

## Primeiro experimento sugerido

Comparar a instrução atual com uma candidata que peça ao planejador para, dada a direção comum, identificar o que manter e descrever uma diferença **visível** em cada proposta. Quando houver comentário explícito, incorporar o aspecto solicitado e preservar os demais. Exemplo: com o mesmo produto e paleta, uma variante pode começar pelo objeto, outra por uma situação de uso, outra pela pergunta que o comprador se faz. Usar essas opções somente quando forem compatíveis com a direção. No ensaio, congelar briefing, referência, feedback, modelo, orçamento e regra de julgamento. Comparar diversidade e aproximação separadamente. Uma melhora de texto só justifica investigar a renderização, e a preferência humana exige a participação da pessoa.

## Reprodução

Em `apps/web`, com as dependências do PR instaladas:

```sh
node --import tsx ../../scripts/evals/pr61/variacoes/baseline.mjs
node --import tsx ../../scripts/evals/pr61/variacoes/baseline.mjs --blind
```

O primeiro comando confere os hashes dos pixels julgados, reapura os votos, relata cobertura e reaplica os controles ao código da revisão em execução. O segundo prepara cópias cegas em diretório temporário e executa os controles. A nota semântica vem de uma inspeção anterior e deve ser refeita para novas imagens. Ambos funcionam offline.

## Rodadas de cinco lotes

O ensaio atual usa a mesma entrada e os mesmos três slots dos marcos 3 e 5. A unidade de divergência é um par dentro do lote: A–B, A–C e B–C. Cinco lotes completos oferecem quinze pares por rodada. Um juiz examina em conjunto os cinco casos com os prompts; outro processo recebe as artes correspondentes em ordem cega e verifica a divergência que se materializou. A graduação exige diferença concreta em hierarquia, foco, enquadramento ou percurso, preservando os pedidos explícitos. A preferência do criador e a aproximação após feedback humano continuam sem observação enquanto não houver avaliações humanas associadas. [Protocolo das rodadas](../../../scripts/evals/pr61/triagem/protocolo-rodadas.md) · [Instrumento independente](../../../scripts/evals/pr61/variacoes/juiz.py)

No controle negativo, o juiz independente `gpt-6.2-astra` recebeu os cinco planos fixos. Cada um continha três propostas com apenas um número diferente. Os **15/15 pares receberam nota 0**. O extrato destinado ao redator incluiu somente os três IDs de desenvolvimento. Esse controle verifica sensibilidade à duplicação explícita; a sensibilidade a diferenças visuais sutis requer as artes de cada rodada. A sessão `01a1ee89-48ea-7503-a97b-ca44511c19f8` produziu a resposta SHA-256 `e99dfc07879a74d91c8b8446a2c9a6a89174f03e4da49b02d8ce5fea930b641c`.

Na rodada de controle do adaptador `18dc2a2`, houve cinco planos reais e 15 artes confirmadas. Nos casos de desenvolvimento 1, 2 e 3, os pontos de divergência dos três pares ficaram, respectivamente, em 6 / 6, 5 / 5, 6 / 6 (plano / pixels, máximo 6 em cada perspectiva). A triagem e a variação compartilham os mesmos IDs de plano e PNG. Dois casos reservados permanecem fora do ajuste das instruções. O relatório do marco 4 tem SHA-256 `f5cb7fb576376e4dbb5b2e69c0b006987a6176c59516d80a945b8748fd308df4`. A sessão de planos foi `01a1ee8d-37ca-7062-bcac-c44ac6da5337`. A sessão de pixels foi `01a1ee8d-37ca-7a91-89c4-8b3b10273a22`.

## Resultado das quatro rodadas reais

O marco 4 comparou três pares por lote. Os juízes de plano e de pixels trabalharam em sessões independentes, com a ordem dos casos e dos slots embaralhada em cada pacote. Cada célula contém a soma dos três pares do caso em plano e em pixels, com máximo de 6 pontos em cada modalidade. A parcela sem evidência da rodada 3 aparece como ND. O total observável é 30 em R0–R2 e 24 em R3.

| Caso | R0 plano / pixels | R1 plano / pixels | R2 plano / pixels | R3 plano / pixels |
|---|---:|---:|---:|---:|
| 1 · Oficina de impressão | 6 / 6 | 5 / 6 | 5 / 5 | ND / ND |
| 2 · Mostra de gravuras | 5 / 5 | 5 / 5 | 5 / 5 | 6 / 6 |
| 3 · Troca de livros | 6 / 6 | 5 / 5 | 6 / 6 | 6 / 6 |
| 4 · Rota de leitura (reserva) | 5 / 5 | 5 / 6 | 5 / 6 | 5 / 5 |
| 5 · Inventário de formas (reserva) | 4 / 4 | 5 / 5 | 4 / 3 | 6 / 5 |
| Desenvolvimento | 17 / 17 | 15 / 16 | 16 / 16 | 12 / 12 |
| Reserva | 9 / 9 | 10 / 11 | 9 / 9 | 11 / 10 |
| Total | 26 / 26 | 25 / 27 | 25 / 25 | 23 / 22 |

Dos quinze pares de imagens, receberam a nota máxima **11/15** em R0, **12/15** em R1 e **10/15** em R2. R3 atingiu **10/12** nos pares observáveis e deixou três pares sem pixels. Nos quatro casos pareados com R3, R0 tinha 8/12. A reserva teve, respectivamente, 3/6, 5/6, 3/6 e 4/6 pares plenamente distintos.

R1 ganhou pares plenamente distintos nos dois casos reservados, mas perdeu um par no caso 3 e apresentou regressões de fidelidade. R2 ganhou em apenas um caso e perdeu em outros dois. R3 melhorou em dois dos quatro casos observáveis; o plano recusado no caso 1 e a perda de atributos nos casos concluídos impedem promoção. As instruções do controle permanecem no runtime. As quatro trajetórias são amostras estocásticas de cinco briefings sintéticos com uma execução por caso e braço. Uma nota alta de divergência revela diferenças que o juiz identificou; a preferência entre elas continua dependendo de pessoas.

As revisões avaliadas foram `18dc2a2`, `c988a6f`, `86729b7` e `e6ed07d`. O JSON inclui as duas modalidades dos cinco casos das quatro rodadas, os contadores de reserva, os IDs das 16 sessões independentes, os hashes dos PNGs e recibos e as comparações pareadas. Os escores nas tabelas identificam as mesmas gerações usadas no marco 5. [Matriz e proveniência](../../../scripts/evals/pr61/triagem/rodadas-reais.json) · [Comparação reproduzível](../../../scripts/evals/pr61/variacoes/fechar-rodadas.py)
