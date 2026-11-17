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
