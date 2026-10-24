# Três modelos de interação para o Compor

23/10/2026. **Simulação de desenho e hipóteses de UX**, a partir do [briefing](../../../briefing-design-e-mercado-2026-10-23.md) e da [spec consolidada](../../../specs/compor-reestruturado-2026-10-23.md). Nenhuma opção foi testada com pessoas. A crítica posterior dos subagentes será uma inspeção sintética, não validação de uso, demanda ou preferência humana. Este documento descreve o que desenhar; não implementa o produto.

## Contrato comum para comparar experiências

Usar o mesmo exemplo fictício: Marina divulga **Planilhas para a rotina**, com cinco aulas gravadas, exercícios e inscrições abertas. Voz prática e acolhedora. Ação desejada: conhecer o curso. Texto inicial: “Aprenda fórmulas básicas com exercícios para organizar suas planilhas”. Marina muda “organizar suas planilhas” para “cuidar das tarefas do dia a dia”; essa correção deve sobreviver à troca de composição.

Na exploração, duas abordagens completas: **tarefa repetida**, que apresenta uma dificuldade cotidiana, e **exercício em ação**, que demonstra o conteúdo do curso. A diferença está no argumento e na composição, não apenas na cor. Arte e legenda precisam ser visíveis; nenhum depoimento, volume de vendas ou resultado de aluno é inventado.

Para o estado de revisão, inserir deliberadamente a expressão **“acesso vitalício” como fato pendente do cenário**, não como característica confirmada do curso. Mostrar “Confirmar com minha informação” e “Retirar da peça”. Não permitir aprovação final enquanto a expressão pendente estiver na saída. Pendência não utilizada não bloqueia.

Em A, B e C:

- Mensagem definida começa com **uma composição**; exploração declarada começa com **duas rotas**. Texto pronto não escolhe a intenção automaticamente.
- Explorar permanece visível; a pessoa pode mudar de intenção e concluir uma única peça.
- Pedir outra composição conserva o texto manual. Pedir reescrita apresenta diferenças antes de aplicar; desfazer permanece disponível.
- Rejeitar ambas conserva texto, fatos, recursos e alternativas anteriores. Falha ou cancelamento não apaga trabalho.
- Revisar, aprovar, exportar **PNG + TXT** e retomar são ações distintas. Saída e geração são identificadas como simuladas no protótipo.
- Não desenhar chat obrigatório, nota de conversão, publicação automática, cobrança ou uma obrigação de gerar mais.

Desenhar cinco quadros principais por modelo, com estados auxiliares anotados junto do quadro correspondente. Manter conteúdo, tamanho das prévias e nível de detalhe comparáveis entre opções; moodboards não devem determinar a escolha da estrutura de interação.

## A — Estúdio direto

**Modelo mental:** trabalho numa peça e abro outras ferramentas quando preciso. A unidade central é a peça editável. A comparação é uma vista temporária do mesmo trabalho.

### Cinco telas-chave

| Quadro | Composição do wireframe | Ações e estado a mostrar |
|---|---|---|
| A1 — Abrir o estúdio | Área da arte ainda vazia, texto inicial ao lado, contexto compacto; projeto recente acessível | Colar texto/pedir rascunho; escolher “Compor esta mensagem” ou “Explorar abordagens”; retomar versão salva |
| A2 — Editar no conjunto | Arte central grande, texto e legenda próximos; fatos em painel contextual recolhível | Editar frase, desfazer, mudar composição preservando texto; indicação “Alteração mantida”; ação “Explorar outra abordagem” visível |
| A3 — Comparar quando necessário | Vista ampla com duas artes e legendas equivalentes; uma frase descreve cada argumento | Escolher, editar uma rota ou rejeitar ambas; fechar comparação retorna ao mesmo projeto |
| A4 — Revisar sem sair da peça | Prévia do selecionado e painel de revisão, com a frase pendente destacada no lugar onde aparece | Confirmar ou retirar fato; revisar legenda; aprovar quando resolvido; voltar à edição |
| A5 — Saída e continuidade | Arte aprovada, identificação de PNG e TXT, confirmação de saída simulada | Exportar; retornar à edição; sair e retomar pelo cartão do projeto na versão escolhida |

**Jornada definida:** A1 → A2 → A4 → A5. **Exploração:** A1 → A3 → A2 quando houver ajuste → A4 → A5. A2 também abre A3 por escolha. Rejeitar ambas em A3 abre a intenção existente para ajuste, sem limpar o projeto. Falha na segunda rota mantém a primeira acessível em A2/A3.

**Hipótese de valor:** ver texto e arte continuamente pode reduzir transferências mentais e tornar evidente que a edição manual foi respeitada. É candidato para quem chega com mensagem e recursos razoavelmente definidos; isso não é segmentação validada.

**Prós:** acesso direto ao material; revisão contextual; poucas transições para ajustes simples; retomada próxima do estado anterior. **Contras:** exige hierarquia forte para não virar um painel carregado; quem ainda não sabe o próximo passo pode ficar parado; comparação temporária pode enfraquecer a descoberta.

**Cenário que invalidaria A:** em tarefas observadas, participantes com intenção clara não distinguem editar de reescrever, não encontram revisão/saída ou precisam de orientação contínua para concluir. A preferência estética pelo estúdio não compensaria essa falha.

**Heurística RCD aplicada:** hierarquia de atenção orientada à ação útil e **Swiss Knife filter** para deixar controles secundários fora do caminho principal. O critério é conseguir trabalhar na peça, não exibir todas as capacidades.

## B — Percurso guiado

**Modelo mental:** sigo uma sequência curta, sabendo o que decido agora e podendo voltar. A unidade central é a tarefa em andamento; o conteúdo é preservado entre etapas.

### Cinco telas-chave

| Quadro | Composição do wireframe | Ações e estado a mostrar |
|---|---|---|
| B1 — Preparar a divulgação | Uma área de texto, oferta/público/ação em campos breves e intenção explícita | Usar texto próprio ou rascunho; salvar e pausar; começar sem completar um perfil de marca |
| B2 — Ver a proposta | Uma prévia no caminho definido; duas equivalentes no exploratório; indicação da intenção atual | Continuar com uma peça, explorar, rejeitar ou rever intenção; nenhuma dupla obrigatória para tarefa definida |
| B3 — Ajustar | Peça selecionada com texto e legenda editáveis; contexto disponível sem sair | Corrigir frase, recompor, desfazer; voltar às propostas sem perder a correção; seguir sem editar se já serve |
| B4 — Conferir | Material completo e uma lista curta de questões reais de revisão | Resolver “acesso vitalício”, conferir voz/legibilidade, aprovar; retorno direto ao trecho que precisa mudar |
| B5 — Concluir ou retomar | Saída PNG/TXT simulada e identificação do projeto | Exportar; voltar a ajustar; retomar posteriormente na etapa e versão salvas |

**Jornadas:** B1 → B2, com uma ou duas rotas conforme intenção → B3 quando houver ajuste → B4 → B5. A edição não é uma tarefa obrigatória para habilitar o próximo passo. Rejeitar em B2 permite rever B1 já preenchida ou solicitar novas abordagens conservando as antigas. Voltar nunca reinicia o percurso inteiro.

Mostrar navegação por etapas reais, com a etapa atual e anteriores acessíveis. Não usar porcentagem arbitrária de progresso, checklist de ações sem valor ou congratulação por gerar mais. Durante geração, a pessoa pode cancelar e continuar com o que já existe.

**Hipótese de valor:** limitar a decisão corrente pode ajudar quem sabe a tarefa, mas não sabe como conduzir a elaboração. A sequência é candidata para reduzir desorientação, sem pressupor que toda pessoa iniciante queira um assistente guiado.

**Prós:** próxima ação explícita; revisão perceptível; menor quantidade de controles simultâneos. **Contras:** pode acrescentar cliques para quem já tem método; alternar criação e revisão pode ficar burocrático; passos podem induzir a avançar sem realmente conferir.

**Cenário que invalidaria B:** a maior parte do esforço observado passa a ser navegar entre etapas, com retornos frequentes para ajustes simples ou aprovações mecânicas para chegar ao fim. Um checklist concluído não sustentaria a hipótese de orientação.

**Heurística RCD aplicada:** **fricção declarativa** para situar a tarefa e jornada até o valor para ordenar o mínimo necessário. A sequência precisa entregar informação útil a cada passo, sem transformar onboarding em treinamento.

## C — Bancada comparativa

**Modelo mental:** mantenho propostas visíveis, comparo o que cada uma diz e desenvolvo a escolhida. A unidade central é a decisão entre rotas; o material editável continua acessível dentro dessa decisão.

### Cinco telas-chave

| Quadro | Composição do wireframe | Ações e estado a mostrar |
|---|---|---|
| C1 — Preparar a bancada | Intenção, mensagem e fatos em faixa superior compacta; área de propostas abaixo | Colar/pedir rascunho; compor ou explorar; abrir projeto anterior com seleção preservada |
| C2 — Bancada de propostas | Uma ficha ampla para mensagem definida ou duas fichas equivalentes para exploração; arte, argumento e legenda em cada ficha | Selecionar, rejeitar ambas, explorar outra abordagem; distinguir seleção de aprovação |
| C3 — Foco numa rota | Ficha escolhida expandida para edição direta; acesso visível à outra e à bancada | Editar texto/legenda, recompor mantendo palavras, desfazer; retornar sem perder a comparação |
| C4 — Decisão e revisão | Selecionado em destaque, alternativas recolhidas; fatos pendentes no material e painel de revisão | Confirmar ou retirar pendência; aprovar somente o escolhido; voltar à bancada se a dúvida reaparecer |
| C5 — Entrega da decisão | Peça aprovada e saídas PNG/TXT simuladas, com identificação do projeto | Exportar; retomar bancada com rota escolhida e demais propostas preservadas |

**Jornada definida:** C1 → C2 com uma ficha → C3 se necessário → C4 → C5. Não mostrar um espaço vazio sugerindo que falta obrigatoriamente uma segunda peça. **Exploração:** C1 → C2 com duas fichas → C3/C2 conforme ajustes → C4 → C5. A passagem entre foco e bancada conserva a edição.

Rejeitar ambas não some com a base: as propostas ficam recuperáveis e a intenção pode ser corrigida. Novas alternativas não criam uma grade ilimitada: manter duas visíveis na comparação e as anteriores acessíveis no histórico. Isso é organização da vista, não limite comercial nem bloqueio da exploração.

**Hipótese de valor:** diferenças permanecem disponíveis enquanto a pessoa decide, reduzindo dependência da memória. É candidato para uma dúvida de comunicação explícita; não promete que a escolha interna preveja conversão.

**Prós:** argumento e arte podem ser comparados no mesmo contexto; diferenças e rejeição têm lugar claro; histórico da decisão fica legível. **Contras:** pode incentivar geração e comparação excessivas; duas peças reduzem espaço de leitura; quem só quer finalizar pode achar a bancada desnecessária.

**Cenário que invalidaria C:** a comparação aumenta a indecisão sem revelar uma abordagem útil, as prévias ficam pequenas demais para avaliar texto ou a pessoa não distingue selecionar de aprovar. Mais alternativas vistas não compensam perda de conclusão.

**Heurística RCD aplicada:** hierarquia de atenção e disciplina de funcionalidades a serviço da escolha. Mesmo destaque para alternativas evita um vencedor visual arbitrário; o botão principal muda para revisar quando já existe uma seleção, sem bloquear exploração.

## Como comparar as três hipóteses

| Dimensão | A — Estúdio direto | B — Percurso guiado | C — Bancada comparativa |
|---|---|---|---|
| Objeto central | Peça em edição | Tarefa em etapas | Decisão entre rotas |
| Organização | Espaço contínuo com vistas contextuais | Sequência com retornos preservados | Bancada persistente com foco em uma ficha |
| Maior aposta | Controle imediato e poucas transições | Clareza do próximo passo | Diferenças úteis disponíveis durante a escolha |
| Maior risco | Sobrecarga ou desorientação | Burocracia e avanço mecânico | Indecisão e geração sem conclusão |

Para a inspeção sintética dos PNGs, percorrer o mesmo roteiro em cada opção: escolher intenção; corrigir a frase; mudar composição; reconhecer que a correção ficou; rejeitar ambas no caminho exploratório; resolver o fato pendente; aprovar/exportar; encontrar como retomar. Registrar caminhos ausentes, ambiguidades e conteúdo ilegível. Não inventar tempo de tarefa, cliques executados, satisfação ou taxa de sucesso a partir de uma imagem.

No protótipo navegável futuro, avaliar conclusão e descoberta útil com critérios definidos antes da tarefa, incluindo dificuldade de escolha, ajuda e correção indesejada. A ativação continua aprovar/exportar uma arte com legenda sobre todos os qualificados atribuídos; telas visitadas não a substituem. Usabilidade, benefício incremental e pagamento continuam perguntas separadas. Nenhuma variante é vencedora nesta etapa.

## RCD: mecanismos e proveniência

Princípios lidos na skill `revenue-centric-design`, revisão upstream `1942760c2242f609bf63ce2c97204f5a1791bd68`:

- [Hierarquia de atenção orienta comportamento](https://x.com/richardrx/status/2039399756452057159): A prioriza edição; B o próximo passo; C a comparação útil.
- [Swiss Knife filter](https://x.com/richardrx/status/2059236567533650119): limitar carga, custo e funções que não servem ao trabalho central.
- [Fricção declarativa](https://x.com/richardrx/status/2052350703541039324): perguntar pela intenção que muda o percurso, sem cadastro administrativo extenso.
- [Mapear a jornada até o valor](https://x.com/richardrx/status/2074814716824731651): observar onde a tarefa deixa de avançar, sem presumir o gargalo.
- [Medir ativação](https://x.com/richardrx/status/2059616501544468624): conclusão útil, não volume de geração ou visita a telas.

São heurísticas atribuídas, sem benchmarks transplantados ou resultado demonstrado no Compor. Os links são os originais registrados na skill; não foram reabertos nesta etapa. [Termos preservados](../../../debate/2026-10-20-rcd/RCD-LICENSE.txt).
