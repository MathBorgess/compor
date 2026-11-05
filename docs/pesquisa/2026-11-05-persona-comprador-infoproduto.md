# Persona do comprador do infoproduto: pesquisa e proposta para a demo

**Data:** 05/11/2026. **Estado:** pesquisa e desenho para revisão, não uma skill ativa, uma implementação ou uma afirmação validada sobre compradores. Matheus incluiu a etapa “Conhecendo quem vai comprar”, uma skill de persona e a [SCRUM-70](https://compor-mathai.atlassian.net/browse/SCRUM-70) na demo. O pedido atual substitui a nota anterior da issue que deixava o item fora do caminho crítico; os demais critérios da issue permanecem insumos para revisão.

## Qual pessoa queremos entender

O **criador** usa o Compor para divulgar sua oferta. O **comprador do infoproduto** é a pessoa que pode adquirir essa oferta. São papéis diferentes, mesmo que um indivíduo possa ter ambos. A [SCRUM-70](https://compor-mathai.atlassian.net/browse/SCRUM-70) pede referências que vão além do gosto visual, como o que o público assistia, expressões e cultura. A [SCRUM-62](https://compor-mathai.atlassian.net/browse/SCRUM-62) descreve uma pesquisa sobre como criadores fazem posts; não demonstra, por si só, os hábitos ou a cultura de seus compradores. O status e os registros de entrevistas devem ser verificados nas fontes vivas; o roteiro da SCRUM-62 estava em Backlog na consulta desta data.

A [SCRUM-22](https://compor-mathai.atlassian.net/browse/SCRUM-22) distingue relatos públicos, entrevistas e simulações. Sua contagem histórica de relatos e a checagem de respostas de 23/10 não autorizam afirmar o estado atual das entrevistas nem generalizar para compradores de todos os cursos. É preciso indicar qual coorte e pergunta cada evidência realmente cobre.

O [manual de pesquisa do GOV.UK](https://www.gov.uk/service-manual/user-research/start-by-learning-user-needs) recomenda separar evidência de opiniões e validar necessidades com pesquisa. O [Value Proposition Canvas, da Strategyzer](https://www.strategyzer.com/library/the-value-proposition-canvas), organiza um segmento por tarefas, dificuldades e ganhos esperados; a relação entre uma oferta e essas necessidades é hipótese até ser testada. Essas referências apoiam um método de investigação, mas não comprovam a efetividade de uma peça do Compor ou uma taxa de conversão.

## Captura proposta: “Conhecendo quem vai comprar”

A etapa complementa o briefing da oferta e deve permitir pular campos desconhecidos. Matheus confirmou que é possível seguir com hipóteses e campos desconhecidos e pesquisar referências culturais públicas na web quando útil. A referência encontrada deve citar sua fonte e não comprova, por si só, que o público específico a conheça ou valorize. Sugestão de perguntas curtas, com exemplos dados pela própria pessoa criadora:

1. Quem você espera alcançar com essa oferta e em que situação essa pessoa está? Qual evidência você já tem disso?
2. O que ela tenta conseguir, o que a atrapalha e que alternativa já usa? Se possível, conte um caso real ou traga uma fala autorizada.
3. O que poderia deixá-la em dúvida antes de comprar? O que você sabe e o que está supondo?
4. Há filmes, programas, criadores, músicas, referências ou expressões que ela realmente conhece ou usa e que façam sentido para esta peça? O que deseja evitar? Campo opcional, sem assumir preferências a partir de idade, região ou outros atributos.
5. Qual ação você quer que ela tome e que fatos comprováveis da oferta podem aparecer? A skill não pode inventar preço, data, garantias, falas nem resultados.

A proposta deve preservar o princípio de não alongar a jornada: começar com as perguntas indispensáveis à criação e oferecer aprofundamento opcional por chat. A duração e o número de perguntas necessários são hipóteses de UX a testar, não medições. Perguntar por comportamentos e episódios recentes oferece uma fonte diferente de expectativas; o [guia de facilitação do GOV.UK](https://userresearch.blog.gov.uk/2014/07/11/what-makes-a-good-user-research-facilitator/) recomenda perguntas abertas sobre o que a pessoa fez, em vez de tratar opiniões isoladas como comportamento observado.

**Recorte inicial da etapa:** depois do briefing da oferta, apresentar três campos curtos: quem a pessoa quer alcançar, em que situação esse comprador está e o que ele quer conseguir. Nenhum é obrigatório; o botão **Continuar com o que sei** mantém desconhecidos como vazios. Referências culturais, afirmações e fontes ficam em detalhes opcionais que a pessoa pode abrir, editar e remover. A origem distingue hipótese, relato da pessoa criadora, relato de comprador e fonte pública. O chat poderá aprofundar a análise após a conexão da IA; o formulário não gera uma persona fictícia por conta própria. Esse recorte ainda precisa de verificação de usabilidade e não estabelece duração ou taxa de conclusão.

## Contrato proposto para a skill de persona

A unidade estudável é `persona-comprador`, com versão explícita de instruções, contrato e rubrica, isolada do motor de imagem e do controlador do chat. O nome e a forma de distribuição são provisórios. A skill trata da pessoa compradora da oferta, não do perfil Phoenix do criador, que continua em etapa posterior salvo nova decisão.

**Entrada:** objetivo, fatos da oferta, descrição do público informada pelo criador, exemplos e referências disponíveis, contexto da peça e restrições de conteúdo. Cada dado deve trazer origem e classificação disponíveis: relato direto do comprador, informação do criador sobre o público, fonte consultada, hipótese do criador ou informação não fornecida. A própria classificação é um relato do fluxo, não autenticação da origem.

**Saída estruturada para revisão:**

| Campo | Tratamento proposto |
| --- | --- |
| Segmento e situação | Quem a oferta busca atender e em que contexto, sem biografia inventada. |
| Necessidade, obstáculos e ganhos | Afirmações associadas a uma fonte ou marcadas como hipótese. Separar o que alguém disse de interpretação do modelo. |
| Decisão de compra | Dúvidas e critérios quando informados; caso contrário, indicar lacuna. Não presumir capacidade financeira, comportamento ou promessa. |
| Referências culturais e linguagem | Lista opcional com obra, expressão ou referência fornecida, origem, relação descrita e limitações. Não generalizar uma referência isolada a todo o público. |
| Hipóteses e perguntas abertas | Lacunas relevantes e uma pergunta por vez quando for útil; permitir prosseguir com o que existe. |
| Implicações criativas | Sugestões de mensagem e direção identificadas como sugestões, rastreáveis às entradas. A pessoa revisa a proposta; a skill não altera a oferta. |
| Versão e estado | Versão da skill, identificadores dos insumos usados e estado da análise; conteúdo efêmero de demo no navegador, conforme o recorte atual de rascunhos. |

O conteúdo submetido pode incluir textos fornecidos pelo usuário ou trechos externos. Tratá-los como dados, não como instruções. A skill não deve inventar depoimentos, estatísticas, equivalências culturais, acesso a fontes, disponibilidade de imagem ou aprovação da pessoa. Referências desconhecidas ficam desconhecidas. A busca de referências culturais públicas foi autorizada; ela deve usar consultas que não revelem dados privados ou pessoais. Essa autorização não implica enviar dados de participantes a terceiros ou treinar um modelo.

## Como avaliar e otimizar separadamente

A versão inicial deve ser comparada com versões candidatas na mesma amostra de casos e rubricada antes de promoção. Não há necessidade de treinar modelos para estudar uma skill: instruções, exemplos, limites e modelos de saída são variáveis possíveis de experimento. Para evitar confusão, distinguir ajuste de prompt, avaliação automática, eventual fine-tuning e atualização de produto; cada qual exige seu próprio contrato. A [OpenAI recomenda combinar critérios de avaliação e revisão humana](https://developers.openai.com/api/docs/guides/evaluation-best-practices) e comparar um novo prompt com os casos de referência, pois uma mudança pode piorar casos específicos.

**Conjunto de testes proposto:** fixtures sintéticas claramente marcadas, cobrindo briefing completo, lacunas, hipóteses, fonte contraditória, duas audiências, expressões fornecidas e ausência de referências. Quando houver relatos de compradores reais e autorização compatível, criar casos separados e protegidos; não converter relatos sobre o criador em fatos sobre seu público. Separar conjunto de desenvolvimento de conjunto não usado nos ajustes e preservar identificadores e versões do conjunto, prompt e modelo. Escolher tamanho, amostragem e critérios antes de comparar; um conjunto pequeno serve para detectar falhas, não para provar representatividade.

**Indicadores candidatos, com numerador e denominador explícitos:**

- **Rastreabilidade:** afirmações factuais da persona com origem identificada ÷ afirmações factuais avaliadas; registrar também lacunas sem fonte e casos não avaliáveis.
- **Ausência de invenção:** casos sem afirmações não sustentadas tratadas como fato ÷ casos avaliados; revisão humana amostral ou integral conforme tamanho. Um caso contraditório deve preservar a divergência.
- **Cobertura útil:** campos essenciais preenchidos com evidência ou lacuna corretamente indicada ÷ campos essenciais aplicáveis. Campo fictício ou preenchido por estereótipo não conta como cobertura.
- **Integridade do contexto:** sugestões que respeitam a oferta, público e peça/versão selecionados ÷ sugestões avaliadas; incluir troca de peça, referência e pedido de ajuste no conjunto de regressão.
- **Utilidade para o criador:** julgamento humano por rubrica cega em comparação lado a lado com base de referência; registrar quantidade de avaliadores, discordâncias, notas e justificativas. Preferência de um avaliador não prova conversão do público.
- **Operação:** duração, uso e custo estimado por análise e quantidade de perguntas exibidas; registrar dados ausentes e diferenciar estimativa de fatura. Conversão, cliques ou vendas só são resultados quando o respectivo evento for efetivamente observado e ligado de modo válido à campanha; a skill não deve fabricá-los.

Casos de avaliação reais e traces de desenvolvimento são diferentes dos rascunhos transitórios da pessoa no app. No marco 0, rascunhos e transitórios ficam no navegador; qualquer coleta persistente para avaliação ou treinamento requer decisão separada e tratamento adequado. Os dados não devem ir automaticamente para logs. A [documentação de deprecações da OpenAI](https://developers.openai.com/api/docs/deprecations) registra que a plataforma Evals se tornou somente leitura em 31/10/2026 e tem desligamento agendado para 30/11/2026. Portanto, não criar dependência da API de Evals para a demo; manter os casos e a rubrica portáveis.

## Pontos para a revisão do desenho

- Quais duas ou três perguntas da etapa devem ser obrigatórias e qual comportamento permite seguir sem conhecer o comprador? As sugestões acima são ponto de partida.
- Como mostrar a fonte pública e a distinção entre seu conteúdo e a hipótese sobre o público? A busca pública foi autorizada, assim como PNG/JPEG enviados para referências visuais.
- Como exibir fato, relato do criador e hipótese sem transformar o briefing em um questionário longo? Como a pessoa corrige uma afirmação antes de usá-la na peça?
- Quais saídas da skill ficam no rascunho local e quais entram explicitamente em uma versão salva do projeto? A conversa de web não é compartilhada pelo MCP; projetos, peças e versões são.
- Qual conjunto inicial de casos sintéticos e qual rubrica de avaliação Matheus quer revisar antes de promover uma versão da skill? Não há limiar de aprovação definido por esta pesquisa.
