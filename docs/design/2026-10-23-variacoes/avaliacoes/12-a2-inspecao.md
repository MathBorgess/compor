# A2 — Inspeção visual: execução e decisão

23/10/2026 · Arquétipo sintético A2, execução visual e escolha bloqueadas. **Inspeção de imagens estáticas, não teste com usuários nem execução de um protótipo.** Não houve cliques, geração, edição, exportação ou medição de tempo. Textos de preservação e salvamento nos quadros são promessas do desenho, não comportamentos verificados.

Li o [briefing](../../../briefing-design-e-mercado-2026-10-23.md) e [01-ux-fluxos.md](01-ux-fluxos.md). Vi, via `view_image`, os nove arquivos solicitados:

- [B1.png](../renders/B1.png), [B2.png](../renders/B2.png) e [B2-definida.png](../renders/B2-definida.png).
- [B3.png](../renders/B3.png), [B4.png](../renders/B4.png) e [B5.png](../renders/B5.png).
- [A2.png](../renders/A2.png) e [C2.png](../renders/C2.png).
- [02-encaixe-composicao.png](../moodboards/02-encaixe-composicao.png).

## Parecer

B torna a sequência mais explícita, e B2-definida evita impor comparação a quem já decidiu a mensagem. A2 deixa o ajuste perto da arte; C2 mantém os argumentos lado a lado. São hipóteses legíveis de organização. Ainda faltam estados para demonstrar começar sem texto, rejeitar sem perder trabalho, conferir uma reescrita e concluir a saída. Nenhuma variante está validada ou é vencedora por esta inspeção.

Para esta categoria, o risco principal continua sendo transformar uma tarefa de conclusão em mais decisões. O número de rotas visíveis está contido; a hierarquia de ações e as transições precisam receber o mesmo cuidado.

## Percurso inspecionado

| Situação | Evidência visível e aspecto favorável | Problema ou limite da inspeção |
|---|---|---|
| Começar com mensagem | B1 mostra mensagem opcional, oferta, ação desejada e duas intenções explícitas. Não exige um cadastro completo de marca. | O público não aparece como campo nem contexto acessível; os fatos usados posteriormente também não estão expostos nessa entrada. |
| Começar sem texto | B1 escreve “Começar sem texto: pedir rascunho com os fatos da oferta”. | A frase não aparece como controle identificável. O botão principal continua “Compor esta mensagem”, embora ela possa estar vazia. Não há estado vazio mostrando como pedir o rascunho, fornecer os fatos mínimos e escolher a intenção. |
| Explorar e escolher | B2 oferece duas artes com legendas, nomes e frases que distinguem dificuldade cotidiana de demonstração de exercício. Cada rota tem “Escolher esta” e “Ajustar”. | A primeira arte deixa pouco respiro entre a headline terminada em “planilhas?” e “Conheça exercícios…”. As duas áreas de escolha são legítimas, mas seria preciso observar se alguém entende que “Ajustar” também escolhe uma rota ou abre uma edição temporária. |
| Compor uma ideia definida | B2-definida mostra uma única peça, “Revisar peça” e exploração opcional visível. Uma peça basta para concluir. | A mensagem já contém “cuidar das tarefas do dia a dia”, enquanto B1 mostra “organizar suas planilhas”. O desenho pode representar um estado após correção, mas isso não está identificado; como primeira proposta, a sequência parece conter reescrita sem ação do usuário. |
| Editar e recompor | B3 e A2 mostram texto e legenda editáveis junto à arte, “Texto manual mantido”, “Mudar composição”, “Propor reescrita” e “Desfazer”. A separação verbal é favorável. | Não há antes/depois de recompor nem proposta de reescrita com diferenças, aplicar e cancelar. O texto diz que a aplicação é explícita; a imagem não demonstra esse contrato. |
| Rejeitar | B2/C2 apresentam “Rejeitar ambas”, “Rever intenção” e a garantia escrita de conservação de texto, fatos e histórico. | Não aparece o estado posterior. Não é possível saber visualmente se rejeitar abre intenção, pergunta opcional ou novas propostas, nem como recuperar as anteriores. C2 ao menos oferece “Abrir histórico”. |
| Conferir | B4 destaca “Acesso vitalício — pendente” na peça, explica a pendência e oferece confirmar ou retirar. A aprovação aparece bloqueada. | A retirada ou confirmação não foi desenhada. “Confirmar com minha informação” precisa levar a uma informação conferível, não apenas transformar o clique em evidência. Não há estado resolvido com aprovação disponível. |
| Concluir | B5 distingue peça aprovada de exportação, identifica PNG/TXT e permite voltar à edição ou fechar projeto. | A imagem é anterior à exportação. Faltam confirmação da saída simulada e modo de localizar/abrir os arquivos. A retomada é descrita, mas não mostrada por um projeto reaberto. |

## Problemas materiais a resolver antes de um ensaio navegável

1. **Entrada sem mensagem incompleta.** Mostrar um estado vazio com ação inequívoca para pedir rascunho e os fatos mínimos necessários. Oferta, público e ação precisam ser compreensíveis sem obrigar um formulário longo. A lacuna afeta quem chega sem texto, justamente parte da exploração pedida por Matheus.
2. **Continuidade autoral ainda não demonstrada.** Identificar B2-definida como estado após edição, ou preservar nela a mensagem original até B3. Desenhar a recomposição após correção e a reescrita com diferenças, aplicar/cancelar e desfazer. No caminho exploratório, mostrar B3 com uma das rotas efetivamente escolhidas em B2: o B3 atual usa a mensagem do caminho definido. Isso é uma lacuna na sequência de exemplos, não prova de perda real de conteúdo.
3. **Rejeição e conclusão dependem de saltos.** Acrescentar pós-rejeição com base conservada, revisão resolvida, aprovação explícita, confirmação de exportação simulada e retomada identificável. Esses estados permitem inspecionar o próximo passo; textos explicativos sozinhos não o substituem.
4. **Hierarquia concorrente em B3/A2.** “Mudar composição” e “Revisar peça” têm o mesmo preenchimento escuro. A ação que gera outra tentativa disputa atenção com a que permite concluir. Para quem já fez a correção desejada, testar revisão como ação principal e recomposição como alternativa claramente disponível. Não é necessário esconder exploração.
5. **Comparação precisa de legibilidade equivalente.** Dar respiro entre headline e corpo na primeira rota de B2/C2. O problema percebido é proximidade excessiva; não afirmo sobreposição inequívoca. Em wireframes, uma arte deliberadamente menos legível pode contaminar a escolha do argumento com uma diferença acidental de acabamento.

## Comparação entre A, B e C e direção gráfica

**B:** o indicador de etapa e os verbos tornam a orientação visível. O risco é a sequência parecer obrigatória, inclusive “Ajustar”, quando a peça já serve. B2-definida resolve isso com “Revisar peça”; o caminho exploratório precisa demonstrar o mesmo atalho. O ensaio futuro deve investigar retornos entre etapas, sem presumir burocracia apenas pela quantidade de telas.

**A2:** fatos/referências e versões salvas aparecem como opções laterais, com exploração e revisão acessíveis no mesmo espaço. Isso favorece controle imediato na hipótese do estúdio. A edição, a recomposição e a conclusão continuam disputando atenção. Não vi o percurso completo A nesta atribuição e não comparo sua conclusão global com B.

**C2:** histórico e intenção estão mais explícitos, mas a comparação central é praticamente a mesma de B2. A distinção de uma bancada persistente dependerá das transições e do retorno após editar, não desta imagem isolada. “Público: rotina de planilhas” nomeia um contexto de uso, sem identificar claramente quem receberá a mensagem; convém tornar o exemplo mais específico sem inventar um segmento validado.

**Moodboard 02:** azul intenso, amarelo, fundo claro, preto e formas recortadas comunicam encaixe e construção. A tipografia ampla e os módulos geométricos são coerentes com a ideia de composição. Como inspiração, pode apoiar áreas selecionadas e relações entre partes. Aplicar blocos de cor e formas grandes à interface inteira poderia competir com a arte do usuário; isso é um risco projetado, pois o moodboard ainda não foi aplicado aos wireframes. Não o trato como evidência de preferência humana ou qualidade de uso.

## Próxima verificação proposta

Depois das correções visuais, percorrer no protótipo duas tarefas: uma mensagem já decidida e uma intenção sem texto. Observar se a pessoa distingue compor de reescrever, descobre a exploração, rejeita e recupera opções, identifica o que mudou e conclui uma única peça. Registrar interferência das instruções, abandono e descoberta útil. Autoria preservada, arquivos existentes e retomada precisam de execução real; esta inspeção apenas identifica onde o desenho já comunica essas possibilidades e onde ainda não as mostra.
