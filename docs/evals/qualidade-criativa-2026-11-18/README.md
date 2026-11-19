# Avaliação da qualidade criativa do Compor

Em 18/11/2026, testamos instruções para transformar o briefing em uma direção verificável, a direção em uma arte e a arte em um post com legenda complementar. O diretor de publicidade avaliou as entregas em ordem cega. A bancada usa [casos e controles sintéticos](../../../scripts/evals/qualidade-criativa/README.md), uma [rubrica versionada](../../../scripts/evals/qualidade-criativa/rubrica-direcao-publicitaria.v1.md) e uma [auditoria do post real indicado pelo criador](#sessão-real).

## Sessão real

A versão 4 do post foi conferida na conversa, no contexto do projeto, nas configurações do post, na seleção de referências e na revisão da peça. O criador relatou que as referências foram bem triadas, com briefing e entrega insatisfatórios. A UI mostrou cinco referências confirmadas e registrou a escolha da alternativa de imagem central surreal e tipografia reduzida. O prompt efetivamente enviado ao motor e os anexos que ele consumiu não puderam ser reconstituídos a partir da UI.

A oferta e o público estavam presentes no projeto. Nos campos do post, a mensagem estava preenchida e objetivo e chamada para ação estavam vazios. A síntese visível do agente preservou o tema e o tratamento da referência, mas deixou ambíguo o que o motivo central deveria representar. A arte materializou a palavra ambígua como objeto de jogo, cercado de efeitos genéricos que competem com o foco. A paleta e os dados do evento foram preservados. A revisão ficou sem legenda e o comando de copiá-la estava desativado.

A leitura levou a duas mudanças nas instruções. O significado de um termo ambíguo deve ser explicitado quando trocar o objeto central. A direção precisa dizer qual relação aparece nos pixels para comunicar a proposta. O registro local do caso vincula o parecer, o retorno do criador e uma nova proposta de briefing, arte e legenda. Os dados identificáveis e as imagens de referência ficam fora deste dataset e das chamadas do replay. A versão 4 recebeu 1/5 em empolgação e 2/5 em especificidade. A primeira candidata no chat ficou com 1/5 nas duas escalas. O criador apontou que a arte surreal enfraqueceu a credibilidade e deixou de pensar em quem está começando em desenvolvimento e na mensagem que essas pessoas deveriam entender. Os julgamentos editoriais do modelo seguem na seção de resultados. A segunda candidata de foto com dupla ficou em 1/5 e 2/5. A terceira priorizou a roda, mas o autor pediu linguagem sem jargão e a construção do agente como parte explícita da atividade. A referência subsequente foi aprovada visualmente depois de incluir construção, uso no desafio e resultado no painel, com foco cromático e papel inspirados nas referências selecionadas. A aprovação visual foi registrada.

Na versão composta pela arte e pela legenda, o criador deu **4/5 em empolgação** e **5/5 em especificidade**. A referência atingiu a faixa favorável nas duas escalas neste caso. O diretor de publicidade avaliou a referência e as duas primeiras candidatas em ordem cega contra o briefing final. A referência recebeu 4/4 nas três dimensões nas duas ordens. A primeira candidata ficou em revisão. A segunda incluiu na legenda uma afirmação sobre onde fica a informação do desafio sem fonte confirmada. Trata-se de uma leitura retrospectiva de um caso que recebeu novas informações durante o piloto. O retorno do criador é a medida principal do piloto real.

## Execução

O [capturador](../../../scripts/evals/qualidade-criativa/capturar-sessao.mjs) invoca o handler normal do estúdio com autenticação e estado simulados e intercepta o corpo do POST de criação de sessão. O pedido, o histórico e as instruções exatas passam ao Codex em uma sessão nova, com o modelo `gpt-6.1-terra` e esforço baixo. O replay retorna briefing, prompt e legenda em JSON e proíbe ferramentas. Ele testa o conteúdo sob as instruções capturadas. Autorização, persistência e transporte são verificados pelos testes do estúdio.

O motor ImageGen integrado no Codex recebeu cada prompt sintético com a mesma instrução compartilhada de formato vertical 4:5. Cada braço teve uma amostra visual por caso. A configuração interna, o custo unitário e a semente do gerador integrado ficaram indisponíveis. O produto usa o adaptador Images API com sua configuração própria. A execução não consumiu a credencial do estúdio nem reproduziu o comportamento completo do fornecedor em produção.

O juiz `gpt-6.2-sol`, com esforço médio, recebeu somente pedido, fatos, briefing, legenda e pixels exibidos a 360 px e no original. Avaliou cada ordem em uma sessão independente, com hashes dos insumos e sem ferramentas. Uma primeira leitura incluía o prompt visual. Ao observar que o juiz usava esse prompt para pontuar o briefing, repetimos a leitura sem exibi-lo e preservamos os pareceres anteriores. A primeira calibração também expôs um conflito na descrição de onde a paleta da referência podia aparecer. A descrição do controle foi corrigida antes do julgamento reportado abaixo. A rubrica e os dois casos reservados mantiveram os hashes.

## Resultados do primeiro ciclo

| Ensaio | Base | Candidata | O que apareceu nos pixels e na legenda |
| --- | --- | --- | --- |
| R1, post aprovado nas duas ordens, 2 pares inéditos | 1/2 | 1/2 | Sombra de Bolso ganhou contexto na legenda. Em Bordado no Pano, a relação entre a folha e o ponto enfraqueceu e gerou discordância entre as ordens. |
| R2, reteste diagnóstico dos mesmos casos | 0/2 | 1/2 | Um contorno passou a ligar folha, fio e ponto. Sombra de Bolso continuou em revisão. A legenda teve mais contexto, mas o briefing não registrou restrições centrais de modo suficiente. |
| R2, réplica reservada com fotografia sem texto | 0/1 | 0/1 | Emenda de Chuva produziu duas peças de reparo. Nos dois braços, o encaixe da vareta previsto no briefing ficou pouco demonstrado. |
| Seis controles de calibração julgados duas vezes | — | 12/12 decisões esperadas | O juiz preservou o estilo deliberado, marcou a peça intercambiável para revisão, bloqueou data corrompida, objeto fundido e promessa inventada e se absteve sem pixels. |

Os dois replays apenas textuais de desenvolvimento preservam a nota de briefing e a abstenção para arte e post. Houve melhora de um ponto em Volta de Pote numa leitura e empate na outra. Trama de Aula empatou. A feira com referência cromática participou dos controles de pixels e não compôs o replay A/B de geração. A mesma arte-base de Bordado no Pano recebeu um parecer diferente quando comparada com R2. As duas ordens são verificações de consistência do juiz sobre os mesmos artefatos. Uma diferença nas notas pode vir da ordem, dos demais materiais do pacote ou da variabilidade do modelo. A amostra serve ao diagnóstico e à próxima rodada, sem evidência de ganho geral.

Prévias dos pares completos com base e candidata no primeiro ciclo:

- Sombra de Bolso [base](sombra-de-bolso-base.jpg) · [R1](sombra-de-bolso-candidata.jpg) · [R2](sombra-de-bolso-candidata-r2.jpg)
- Bordado no Pano [base](bordado-no-pano-base.jpg) · [R1](bordado-no-pano-candidata.jpg) · [R2](bordado-no-pano-candidata-r2.jpg)
- Emenda de Chuva [base](emenda-de-chuva-base.jpg) · [R2](emenda-de-chuva-candidata-r2.jpg)

## Skills de direção de arte e preparo do prompt

A candidata R3 introduziu duas skills versionadas, baseadas em [pesquisa de marketing, design e prompting](../../quality/pesquisa-design-social.md). O servidor lê as skills locais e monta as instruções do agente antes de ele propor `generate_image`. O planejador gerenciado recebe o trecho de criação. O compilador da imagem consome o prompt da proposta vinculada e os textos literais. Um POST ao Next compilado com fornecedor simulado capturou as duas skills no corpo montado pelo handler. O build incluiu os arquivos de instruções.

Linha Secreta foi um caso sintético novo. Nas duas ordens, o juiz marcou **2 → 4 em arte**. A base R2 usou uma chave entrando numa fechadura de papel. Na R3, o traço laranja surge do próprio bilhete e se transforma em chave na dobra. O gesto explica a descoberta, preservando data e nome uma vez cada. A nota de post foi 2 → 3 na primeira ordem e 3 → 3 na segunda. Ambas permaneceram em revisão por briefing incompleto. [R2](linha-secreta-base-r2.jpg) · [R3 com as skills](linha-secreta-candidata-r3.jpg)

A instrução de briefing foi então ajustada para guardar fatos, limites e ação confirmada em uma linha curta. No reteste textual R4 do mesmo caso, a nota de briefing subiu de **2 → 3 nas duas ordens**. O formato do caso era metadado da bancada e foi aplicado de forma idêntica no render. O prompt de briefing terminou sem esse detalhe. O reteste não gerou outra arte. A evidência de pixels da R3 pertence à versão 1.0.0 da skill. A versão atual incorpora a clareza para iniciantes, o que a pessoa vai construir e o resultado que poderá observar. A instrução de preparo pede que o agente mantenha visíveis os atributos das referências ao adaptar a peça ao canal e explicite a lacuna se o arquivo ou traço estiver indisponível.

A terceira skill, [formatos para Instagram](../../../packages/agents-api/src/skills/formatos-instagram/SKILL.md), orienta peça única ou abertura de carrossel de acordo com a mensagem. Em [duas sondagens textuais](../../../scripts/evals/qualidade-criativa/reserva-formato-instagram.v1.json), o agente fez uma pergunta específica sobre a interação antes de gerar arte na primeira e, após receber a interação na segunda, preparou somente a capa com as funções dos demais slides no briefing. A saída padrão do estúdio continua sendo uma imagem 4:5 por pedido.

## Replay com duas referências visuais

No caso sintético de uma oficina de encadernação, a mesma entrada e os mesmos dois PNGs chegaram à base `c911725` e à candidata. As duas versões usaram a paleta e o recorte no prompt. A primeira candidata omitiu do briefing o papel de cada referência. Depois do ajuste, o briefing registrou as duas funções, o texto obrigatório e a ação de salvar o post. Na variante com um único PNG, a candidata sinalizou que o arquivo do recorte estava ausente e tratou sua forma exata como hipótese.

O diretor de publicidade atribuiu **2/4 à base e 3/4 à candidata ajustada** nas duas ordens cegas. A primeira leitura incluía a proporção 4:5, que era metadado de renderização fora do pedido textual. O parecer reportado usa um pacote corrigido, com fatos disponíveis ao agente e as duas lacunas declaradas. A arte e o post receberam abstenção porque o reteste avaliou somente a saída textual. O mesmo caso orientou a correção, portanto o resultado é diagnóstico. [Recibo e hashes](replay-referencias.json)

## Verificação semântica do revisor

O Codex recebeu o modelo, o esforço, as instruções e o schema capturados do adaptador. Cada sessão viu um PNG sintético com nome neutro. O adaptador real validou cada resposta em um envelope simulado da Responses API e confirmou o desfecho que o estúdio receberia. Uma tentativa inicial foi descartada porque o processo herdou acesso a ferramentas e consultou documentos de orientação da wiki. Os resultados abaixo vieram de sessões em diretórios temporários, com ferramentas desabilitadas e zero chamadas registradas.

O primeiro ensaio isolado reteve todos os PNGs. Os dois problemas de composição tiveram reprovação válida. A grafia trocada na data foi identificada e o parecer ficou inconclusivo porque incluía observações fora dos critérios marcados como falha. A peça esperada como aceitável também ficou inconclusiva. O pedido dizia “sem faixas”, enquanto a tampa do pote tinha um friso fino. A calibração explicitou a distinção entre o friso e uma faixa decorativa e pediu ao juiz que retornasse somente achados correspondentes às falhas.

Na calibração, os **seis cenários** tiveram o desfecho esperado. O revisor aprovou a peça específica, reprovou a alternativa genérica, o pote com formas fundidas e a data mal escrita. Em dois cenários com o mesmo PNG e o mesmo prompt criativo, a lista de textos literais aprovada alternou entre a data correta e uma data diferente. O filtro liberou somente o primeiro. Os seis cenários usaram quatro PNGs distintos.

Um segundo conjunto reutilizou quatro PNGs sintéticos de trabalhos anteriores e rótulos fixados antes dessa rodada. O revisor aprovou as três direções com papel escuro e grão, xerox surreal e bordado tátil. Reprovou a quarta peça porque a chave metálica na fechadura não cumpria o pedido de mostrar a chave de papel surgindo do bilhete. Os **quatro desfechos** corresponderam aos rótulos. O replay demonstra o comportamento nestes controles. Cobertura representativa, transporte real, custo e latência continuam pendentes. [Recibo e hashes](revisor-semantico.json)

## Primeira rodada na Responses API em 19/11/2026

A rodada usou seis chamadas sequenciais autorizadas, quatro PNGs sintéticos e o mesmo pedido calibrado do replay anterior. O adaptador acionou a Responses API real com GPT-6.2 Sol solicitado. A geração foi simulada e devolveu os PNGs congelados. Todas as chamadas de revisão retornaram HTTP 200. O adaptador liberou três imagens e reteve três.

O resultado correspondeu a **5 de 6 desfechos esperados**. O revisor reteve a imagem genérica, as formas fundidas e o conflito explícito com a data aprovada. Aprovou a arte com **“14 de agosfo”** no lugar de **“14 de agosto”**. Foi um escape entre os quatro cenários esperados para retenção. O diagnóstico local com Tesseract reconheceu as duas grafias em seus respectivos PNGs. Essa conferência é específica destes controles.

O uso informado foi de 9.438 tokens de entrada e 844 de saída, com custo estimado de US$ 0,0273 pela tarifa pública e sem consulta à fatura. As latências ficaram entre 2,49 s e 6,40 s, com mediana de 4,96 s. A rodada identifica um defeito do revisor que o replay via Codex não observou. O filtro editorial estava desligado em produção durante o ensaio. [Resultados e hashes](revisor-responses-2026-11-19.json) · [Preço do modelo](https://developers.openai.com/api/docs/models/gpt-6.2-sol)

## Reprodução

Na raiz, com Python e Pillow instalados e o Codex CLI autenticado via ChatGPT:

```sh
python3 scripts/evals/qualidade-criativa/verificar-dataset.py
python3 scripts/evals/qualidade-criativa/executar.py controls /tmp/compor-controles-novo
python3 scripts/evals/qualidade-criativa/executar.py replay reserva-sombra-de-bolso /caminho/da/revisao /tmp/compor-replay-novo
```

Prepare a revisão de código, inclusive `npm ci --ignore-scripts --prefix packages/agents-api`, e use diretórios vazios. Para julgar, crie um manifesto com linhas `{case,name,artifact}`. Nomeie os braços `base` e `candidata`, indique a imagem local em `artifact.image` quando disponível e inclua os braços planejados mesmo se o artefato estiver vazio. Informe os casos planejados com uma opção `--case` por caso. Use `--dataset` antes do subcomando para uma reserva à parte.

```sh
python3 scripts/evals/qualidade-criativa/executar.py judge MANIFESTO.json /tmp/compor-juiz-novo --case reserva-sombra-de-bolso
```

A referência real fica no pacote privado `quality-results/qualidade-criativa-2026-11-18/`. Para conferir o PNG aprovado, a prévia, as fontes recuperadas, o prompt e a legenda bloqueados por hash:

```sh
python3 scripts/evals/qualidade-criativa/verificar-referencia.py PACOTE/referencia-de-sucesso.json
```

[Evidências sintéticas e recibos](evidencias.json). Os PNGs originais, solicitações e rastros do Codex ficam na pasta local de avaliação `quality-results/qualidade-criativa-2026-11-18/`. Os JPEGs aqui são prévias, com hashes dos originais nos recibos. A base do primeiro ciclo usa `959c385`. As variantes foram avaliadas no checkout isolado e as instruções efetivamente enviadas foram salvas por hash. O [ADR 0075](../../adr/0075-revisao-de-candidatas-a-imagem.md) documenta a retenção antes do Storage, os recibos e as condições de ativação.

A revisão automática da saída foi preparada para o estúdio. Os 12 pareceres dos controles vieram do diretor offline, com duas ordens sobre seis controles. A [qualificação prospectiva do revisor](../../../scripts/evals/qualidade-criativa/README.md#qualificação-do-revisor-de-produção) define como medir escapes, retenção indevida, latência e custo na configuração de produção.

Na verificação local da integração, a suíte web passou em 712 testes sem skip. O ensaio focal do post cobriu a reprovação direta e a recuperação após resposta perdida e recarga. O da exploração cobriu a pausa e um novo pedido explícito. O PostgreSQL simulado em PGlite exercitou as duas migrações, os vínculos de identidade e a prova de cada pedido. Lint, tipos, build e o orçamento de desempenho da entrada anônima também passaram. O fornecedor de revisão foi simulado nos testes de integração.
