# Compor — spec consolidada de produto, experiência e negócio

> Atualização arquitetural aprovada em 26/10/2026: [diagrama e decisões](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/1376258) e [ADRs](../adr/0003-memoria-integral-da-organizacao.md). A v0 passa a Windows e macOS, um usuário/organização, geração de imagens desde o início e salvamento GitHub opcional de todo o contexto da organização. Autorizar sincronização GitHub difere de autorizar envio ao fornecedor de IA. Os requisitos de autoria, versões, revisão, exportação e recuperação abaixo permanecem; a atualização não executa implementação, ensaio ou oferta.

> Observabilidade adicionada em 26/10/2026: [MLflow centralizado na Oracle](../adr/0005-observabilidade-centralizada-mlflow.md) passa a reunir traces e resultados de avaliações. Q18–Q20 fecharam metadados opcionais por padrão; conteúdo somente em testes/evals autorizados; cinco dias de traces operacionais e datasets selecionados separados com origem/consentimento; avaliações em lotes e modelo avaliador somente por comando explícito com limite de gasto. Essa decisão amplia a responsabilidade histórica de compatibilidade/diagnóstico, mantendo a geração e a composição do produto nos caminhos já definidos.

23/10/2026. Síntese com `to-spec`, após pesquisa pública, prospecção e debate de arquétipos, UX/Product Design e CEO. **Desenho candidato para validação; implementação e resultados de mercado ainda não demonstrados.** Esta versão orienta a próxima descoberta e o protótipo. Direções do dono são distinguidas de decisões de desenho e hipóteses comerciais.

## Problem Statement

Uma pessoa responsável por divulgar seu curso, mentoria ou ebook precisa chegar a uma comunicação que aceite usar. Em algumas ocasiões, ela sabe o que dizer e precisa compor; em outras, precisa descobrir e comparar abordagens. Entre intenção e material utilizável, pode perder decisões de voz, refazer texto, escolher sem critério ou recompor trabalho entre ferramentas.

Esse problema não é universal. Há pessoas satisfeitas com Canva, ChatGPT, regras próprias, planejamento editorial e ajuda humana. Há quem produza sem dificuldade e precise principalmente de audiência, confiança ou canal. Há quem venda e ainda enfrente custo ou esforço alto. Um editor deve demonstrar benefício incremental no trabalho de criação, sem prometer resolver aquisição.

A base contém 67 relatos públicos em 63 contextos, com 32 registros de oferta de conhecimento declarada e 35 de contextos adjacentes ou incertos. Nenhum registro comprova por si o ICP completo. Dez convites foram enviados; na verificação inicial final, uma devolução e nenhuma resposta humana foram observadas. A discussão de sete subagentes é simulação fundamentada, não entrevista de cliente nem PMF.

### Público e ocasião

Priorizar quem é responsável por uma oferta própria de conhecimento e tem uma divulgação real, com obstáculo de mensagem, composição, revisão ou decisão que consegue mostrar ou explorar numa tarefa observada. A primeira divulgação também é válida: receita, audiência construída, anúncios anteriores e duas campanhas passadas não são requisitos universais.

Mac, acesso elegível e campanha em até 14 dias são critérios do piloto técnico, não de toda a descoberta. Co-produtores e software ficam em coortes identificadas. Pessoas satisfeitas entram como contrapontos, sem tentar fabricar necessidade. Quem pede apenas compradores, publicação automática ou formatos não atendidos não tem adequação demonstrada à primeira oferta do editor.

## Solution

**Compor é um espaço para elaborar, comparar e concluir texto e visual de uma divulgação, preservando autoria, fatos e decisões.** O resultado é uma arte e sua legenda utilizáveis; a exploração ajuda a decidir, em vez de impor uma quantidade de peças.

A entrada depende da intenção declarada, que pode mudar:

- **Já tenho uma mensagem:** partir de notas ou texto próprio e preparar uma composição, sem reescrever silenciosamente. A alternativa contrastante permanece visível.
- **Quero explorar abordagens:** começar comparando duas rotas contrastantes, com argumento e composição diferentes, mantendo a mesma oferta e fatos. Rejeitar ambas, editar ou voltar à intenção são saídas legítimas.

Uma rota é um conceito de comunicação com arte e legenda; não apenas cor diferente. Uma variante muda uma dimensão escolhida. A pessoa pode concluir uma única peça e explorar mais quando isso responder a uma dúvida. Não há obrigação de completar três rotas e duas variantes para ser considerada ativada.

### Jornada e áreas da interface

1. **Projetos e tarefa:** retomar trabalho ou preparar uma divulgação; informar oferta, público e ação desejada; escolher usar texto próprio ou pedir rascunho. Um exemplo fictício permite conhecer o fluxo sem fornecer conteúdo real.
2. **Estúdio:** texto, legenda e composição no mesmo espaço; base mínima revisável, fatos pendentes/confirmados/omitidos; referências autorais opcionais e recursos autorizados. Edição direta não exige conversa com assistente.
3. **Comparação:** duas rotas em condições visuais equivalentes, diferenças de argumento e composição claras; escolher, rejeitar, editar ou ramificar. Não exibir previsão de conversão.
4. **Revisão e saída:** conferir fatos, voz, legibilidade e recursos; exportar PNG e TXT; abrir fora do app; manter cópia privada e retomar a campanha. Exportado, publicado e vendido são estados diferentes.

As áreas podem compartilhar a mesma tela. O desenho não exige quatro etapas rígidas nem formulário longo de marca. Pedir informações quando necessárias à tarefa. Se falta intenção, permitir salvar e pausar, sem inventar estratégia de aquisição.

### Dores priorizadas

| Prioridade | Dor a investigar/resolver | Mecanismo candidato | Evidência e contraponto |
|---|---|---|---|
| P0 | Perder fatos, decisões ou trabalho | Base versionada, aprovação de mudanças e recuperação | Restrição de qualidade; não pode ser compensada por ganho de velocidade |
| P1 | Corrigir voz ou contexto repetidamente | Texto próprio preservado, edição explícita e preferências controladas | EN01/AD06/PD01; PO03/PP01 já resolvem parte disso |
| P1 | Não conseguir decidir uma comunicação adequada | Rotas proporcionais à intenção e comparação explicada | EN03/PT01/DR04; mais escolhas também podem atrapalhar |
| P1 | Não chegar ao material utilizável sem recompor etapas | Texto e visual juntos, exportação conferida e retomada | DR05; DR02 resolveu com copiar/colar, DR08 é satisfeito |
| Pesquisa separada | Aquisição, CAC, confiança e dependência de plataforma | Investigar oferta/canal fora do editor | PT04/PT05/PO07/PO12; não fundamentam promessa de conversão |

### Modelo de negócio candidato

O produtor ou responsável pela divulgação é o possível comprador; o público dele compra sua oferta. Confirmar usuário, aprovador e pagador quando houver equipe.

A hipótese inicial é um **direito a uma entrega delimitada por campanha**, com oferta, público, finalidade, formato e suporte compreensíveis. Correção de defeitos, mudança pequena de frase ou exploração dentro do escopo não cria cobrança silenciosa. Não estão definidos preço, duração contratual ou limite comercial de revisões. Medir custo e entendimento antes de vender.

Pacote, licença e assinatura continuam alternativas. Assinatura exige valor continuado, ocasiões repetidas e renovação observada; uma segunda campanha não basta. Ler, editar, recuperar e exportar trabalho já criado permanece possível localmente, sem retenção por bloqueio artificial.

G0 — acesso oficial, condições comerciais e rota permitida — precede venda. A comparação gratuita/paga solicitada por Matheus mantém entrega, suporte e janela equivalentes. Seu braço pago só pode ser oferecido depois desse gate e de capacidade real de cumprir a promessa. Serviço manual com intervenção constante testa outra oferta e deve ser registrado como tal.

Receita líquida, custos variáveis, suporte, incidentes, aquisição, manutenção e distribuição serão registrados separadamente. Conta do modelo, aprendizagem e ferramentas já pagas entram no custo total do cliente. Tempo economizado não é receita realizada. Sem novos pagantes, CAC observado é indefinido; sem recorrência suficiente, LTV projetado não decide viabilidade.

## User Stories

1. Como responsável pela divulgação, quero começar pela minha tarefa real, para não preencher um cadastro extenso antes de entender o valor.
2. Como iniciante, quero trabalhar minha primeira divulgação sem provar vendas passadas, para explorar um obstáculo real de criação.
3. Como pessoa ainda sem intenção definida, quero salvar notas e pausar, para decidir o próximo passo sem receber uma estratégia inventada.
4. Como autor com texto próprio, quero compor preservando minha redação, para manter a autoria.
5. Como autor sem rascunho, quero partir de fatos e notas, para construir uma primeira mensagem revisável.
6. Como autor, quero alternar entre meu texto e uma sugestão, para explorar sem perder a versão anterior.
7. Como usuário, quero experimentar um exemplo identificado como fictício, para conhecer o fluxo sem expor material real.
8. Como responsável pela oferta, quero distinguir fatos confirmados, pendentes e omitidos, para controlar o que pode aparecer.
9. Como autor, quero acrescentar exemplos de voz quando forem úteis, para evitar uma configuração obrigatória longa.
10. Como usuário, quero escolher o que fica somente local, para impedir seu envio ao fornecedor.
11. Como usuário, quero ver fornecedor, finalidade e conteúdo de uma tarefa externa, para autorizar o processamento com informação suficiente.
12. Como usuário, quero conhecer limites ou consumo disponível antes da tentativa, para decidir se prossigo.
13. Como usuário, quero corrigir a base sem alterar peças antigas silenciosamente, para preservar decisões anteriores.
14. Como usuário com mensagem definida, quero começar por uma composição, para concluir sem comparar alternativas desnecessárias.
15. Como usuário que quer explorar, quero comparar duas rotas contrastantes, para descobrir uma abordagem relevante.
16. Como usuário, quero ver a opção de explorar outra abordagem durante o trabalho, para não ficar ancorado por uma alternativa escondida.
17. Como usuário, quero mudar a intenção de concluir para explorar, para adaptar o processo à dúvida que apareceu.
18. Como usuário, quero entender o argumento de cada rota, para comparar comunicação e não só aparência.
19. Como usuário, quero comparar prévias equivalentes, para que diferenças de apresentação não determinem minha escolha.
20. Como usuário, quero rejeitar todas as propostas sem perder o trabalho, para continuar por outra direção.
21. Como usuário, quero indicar opcionalmente o que não funcionou, para orientar uma nova tentativa sem responder a um interrogatório.
22. Como autor, quero editar texto, legenda e composição diretamente, para ajustar o material sem depender de um chat.
23. Como autor, quero pedir outra composição preservando meu texto, para mudar o visual sem desfazer correções.
24. Como autor, quero conferir uma reescrita antes de aplicá-la, para manter controle sobre a mensagem.
25. Como usuário, quero desfazer uma alteração, para experimentar sem medo de perder uma opção útil.
26. Como autor, quero decidir se uma correção vale só para a peça ou vira preferência do projeto, para não criar regras permanentes por acidente.
27. Como responsável pela oferta, quero ver mudanças propostas em fatos e benefícios, para impedir publicação de informações não aprovadas.
28. Como usuário, quero ramificar uma rota em uma dimensão escolhida, para investigar uma dúvida sem reconstruir a campanha.
29. Como usuário, quero enxergar mudanças inesperadas numa variante, para conferir se ela respeitou a intenção.
30. Como usuário, quero concluir uma única peça quando ela atende minha tarefa, para não cumprir uma quantidade artificial de gerações.
31. Como usuário explorando, quero continuar criando alternativas por escolha, para preservar liberdade sem ganhar uma pontuação por volume.
32. Como usuário, quero identificar recurso provisório ou ausente, para não confundir rascunho com saída final.
33. Como usuário, quero importar imagens que estou autorizado a usar, para incorporar material próprio à campanha.
34. Como usuário, quero que a cópia importada permaneça disponível se o original mudar de lugar, para reabrir meu trabalho.
35. Como usuário, quero receber recusa clara de arquivo incompatível ou excessivo, para corrigir a entrada sem perder o projeto.
36. Como usuário, quero distinguir espera por autorização, geração, falha e cancelamento, para saber o que fazer em cada situação.
37. Como usuário, quero cancelar uma tentativa preservando resultados anteriores, para interromper sem destruir trabalho.
38. Como usuário, quero que uma resposta atrasada apareça ligada à sua versão de origem, para não sobrescrever minha edição recente.
39. Como usuário, quero repetir uma tentativa por ação explícita, para controlar consumo e evitar repetições automáticas inesperadas.
40. Como usuário, quero revisar fatos, voz, legibilidade e recursos antes da saída, para aceitar conscientemente o material.
41. Como usuário, quero exportar a arte e sua legenda com identificação da versão, para usar os arquivos corretos fora do app.
42. Como usuário, quero abrir PNG e TXT em aplicativos comuns, para conferir se a saída está realmente utilizável.
43. Como usuário, quero separar exportação pública de cópia privada, para não divulgar contexto interno ou credenciais.
44. Como usuário, quero restaurar uma cópia em outro projeto, para recuperar minhas rotas, recursos e decisões.
45. Como usuário, quero abrir, editar e exportar material salvo sem rede, para não perder acesso ao trabalho existente.
46. Como usuário, quero que falha de gravação preserve a última versão íntegra, para poder retomar depois de disco cheio ou interrupção.
47. Como usuário, quero preservar um pacote incompatível ou corrompido, para buscar recuperação sem sobrescrevê-lo.
48. Como usuário satisfeito com outra ferramenta, quero poder preferir meu processo habitual, para não ser tratado como alguém com uma dor escondida.
49. Como participante, quero distinguir revisão autoral desejada de correção indesejada, para que a pesquisa meça o benefício que importa para mim.
50. Como participante, quero combinar o benefício relevante antes da tarefa, para avaliar o resultado sem mover a meta depois.
51. Como participante, quero que preparação, aprendizagem, espera e ajuda apareçam na comparação, para não ocultar o custo de troca.
52. Como participante, quero recusar pesquisa ou telemetria sem perder a entrega combinada, para manter escolha real.
53. Como usuário, quero registrar uso externo e sua fonte separadamente da exportação, para não confundir arquivo pronto com publicação.
54. Como usuário, quero registrar resultado de campanha com canal, período e evidência, para não atribuir venda automaticamente ao Compor.
55. Como comprador futuro, quero entender a fronteira da campanha e do suporte, para prever o que estou contratando.
56. Como comprador futuro, quero distinguir reparo de defeito de nova exploração, para não receber cobrança surpresa.
57. Como comprador futuro, quero condições de entrega, falha e devolução claras antes de pagar, para decidir com informação suficiente.
58. Como usuário, quero continuar acessando meus arquivos depois do término de uma oferta, para não depender de renovação para recuperar trabalho.
59. Como responsável pelo negócio, quero medir conclusão útil e uso independente com denominadores completos, para não esconder abandonos.
60. Como responsável pelo negócio, quero observar retorno apenas quando há nova ocasião compatível, para não confundir uso episódico com abandono.
61. Como responsável pelo negócio, quero registrar custos de suporte e trabalho manual, para não confundir piloto assistido com aplicativo sustentável.
62. Como responsável pelo negócio, quero separar consentimento, qualificação, dor, compromisso e pagamento, para não contar um único aceite como várias provas.
63. Como responsável pelo produto, quero comparar satisfeitos e insatisfeitos, para identificar quando a proposta acrescenta pouco valor.
64. Como responsável pelo produto, quero interromper a entrega afetada por perda de trabalho ou saída factual indevida, para corrigir antes de ampliar uso.

## Implementation Decisions

### Estado e decisões de autoridade

O repositório contém documentação, sem aplicativo implementado. Permanecem direções do dono: Electron para macOS, conteúdo e projetos locais, conexão inicial por conta ChatGPT/Codex, backend Oracle pequeno e acesso oficial antes da venda. Elegibilidade, capacidade, dependências e condições comerciais precisam de verificação atual; a spec não as confirma.

O debate escolhe como candidato uma jornada por intenção declarada. Não há perfil inferido que imponha uma ou duas rotas. A quantidade deixa de definir ativação. O usuário mantém exploração do zero, alternativas contrastantes, comparação e ramificação.

### Fronteiras e responsabilidades

A interface conduz tarefa, estúdio, comparação e saída. O processo principal controla persistência, recursos, exportação e conexão autorizada. Um adaptador de geração recebe apenas o contexto permitido e devolve proposta estruturada; não aplica mudanças nem executa instruções contidas em materiais. O compositor local atende a prévia e a exportação. O repositório local mantém versões, recursos e decisões. O backend não precisa receber campanhas, imagens ou credenciais para cumprir sua função prevista.

Projeto, base aprovada, campanha, rota, variante, recurso e exportação mantêm identidades e versões. Fatos têm estado explícito; a campanha referencia a base usada. A correção local difere de preferência reutilizável. Aplicar, desfazer, salvar e aprovar são operações distintas. Mudança de base não reescreve retroativamente as saídas.

Geração percorre preparada, aguardando autorização, em curso, proposta disponível, falha ou cancelada. Aprovação é estado posterior da peça. Uma fila local executa tentativas delimitadas; resposta atrasada continua vinculada à origem. Cancelamento e falha não destroem alternativas anteriores. Reenvio exige ação explícita.

### Recursos, dados e saída

O primeiro formato candidato é arte estática PNG de 1080 × 1350 e legenda TXT em UTF-8, com cópia privada restaurável. Não equivale a camada editável no Canva. Fontes e recursos precisam de autorização e integridade; imagens provisórias não contam como arte final. Imagem gerada por modelo permanece dependente de integração oficialmente verificada, sem promessa implícita de disponibilidade.

Um fato pendente usado na peça precisa ser confirmado ou retirado antes da aprovação e exportação final. Pendências que não aparecem na saída não bloqueiam a tarefa; rascunhos continuam editáveis.

Salvamento e exportação devem preservar a última versão válida em falha. Restauração cria outro projeto e valida o pacote antes de ativá-lo. Credenciais não entram em prompts, artefatos, cópias ou telemetria. Conteúdo somente local fica fora das chamadas. O trabalho existente continua editável e exportável sem rede ou renovação de oferta.

Os limites de arquivos, recursos, pacote e uso serão herdados como candidatos do contrato técnico anterior e medidos antes de implementação definitiva. A nova jornada não autoriza expandir infraestrutura, mudar fornecedor ou publicar automaticamente.

### Instrumentação

Separar eventos de início da tarefa, intenção escolhida, proposta recebida, revisão, aplicação, rejeição, aprovação, exportação, conferência externa e retomada. Iniciar significa salvar a primeira tarefa com material próprio; usar o exemplo fictício não conta. Não registrar texto ou imagem em telemetria de produto. Guardar versão do ensaio e modo assistido/autônomo; desconhecido e ausência de ocasião são estados explícitos. O serviço funciona sem adesão à telemetria; pesquisa por observação pode registrar consentimento e evidência mínima separadamente.

## Testing Decisions

A fronteira principal de teste permanece a jornada externa: **material autorizado → criação/revisão/decisão → PNG/TXT abertos fora do app → projeto restaurado e editável**. É a maior fronteira já descrita na direção anterior; a síntese preserva essa expectativa e acrescenta as duas intenções de entrada. Não há suíte existente executada ou teste de runtime aprovado nesta entrega documental.

### Comportamento verificável

- Pedido de nova composição conserva texto manual; reescrita aparece como proposta antes de aplicação.
- Correção local não vira preferência permanente sem ação; resposta atrasada não sobrescreve versão recente.
- Texto, fatos omitidos, preço, datas e recursos permanecem consistentes na saída aceita.
- Fato pendente presente na peça impede aprovação e exportação final até confirmação ou retirada; fato pendente não utilizado não bloqueia a tarefa.
- Rejeitar ambas as rotas, cancelar a segunda geração e falhar na exportação preservam trabalho anterior.
- Arquivos públicos abrem fora do aplicativo; cópia privada restaura rotas, recursos e histórico; credenciais e contexto privado não aparecem no pacote público.
- Projeto salvo abre, edita e exporta sem rede; pacote inválido é recusado sem destruir o original.
- Intenção definida começa com uma composição; exploração declarada começa com duas rotas e permite concluir uma peça. Ambas mantêm alternativa visível e intenção mutável.

Esses testes cobrem fronteira de projeto, adaptador, compositor, exportação e recuperação por efeitos externos. Usar um adaptador determinístico para cenários de falha não comprova geração real. Depois, verificar a integração oficial separadamente. Avaliação de voz, utilidade e legibilidade requer a pessoa; simulação não substitui essa avaliação.

### Teste com pessoas e comparação

Reconstruir o processo habitual antes de apresentar a solução. Combinar o benefício relevante à tarefa: concluir algo antes inviável, reduzir correção indesejada ou descobrir abordagem útil. Registrar critério antes do ensaio e observar custo total, sem escolher só velocidade. Comparar tarefas equivalentes e alternar ordem quando possível; relatar aprendizagem, apoio e familiaridade.

Manter no relato os que não concluem. Tempo ativo, duração decorrida e espera são separados; não monetizar espera duas vezes. Revisão autoral desejada é classificada pelo participante, não por número de palavras alteradas. Satisfeitos podem preferir a alternativa atual e continuar sendo evidência útil.

### KPIs e sucesso

| Indicador | Definição operacional | Janela / limite |
|---|---|---|
| Discovery concluído | Entrevistas com perfil, episódio, alternativa, consequência e prioridade documentados | Meta interna de 15; relatos públicos e convites não entram |
| Dor prioritária | Entrevistas qualificadas com dor 4–5 justificada no trabalho de criação/composição/revisão, sem usar aceite como critério de intensidade | Gate legado 9/15; não estima prevalência |
| Compromisso | Material real e sessão marcada, com responsável e ocasião, separados de elogio ou interesse | Gate legado de cinco; sem prometer beta inexistente |
| Ativação primária | Pessoas que aprovam e exportam ao menos uma arte com legenda ÷ todos os qualificados atribuídos | 14 dias após disponibilidade real; manter abandono/indisponibilidade no denominador |
| Ativação entre iniciantes | Mesmo numerador ÷ participantes que salvaram uma primeira tarefa com material próprio | Diagnóstico secundário; demonstração não conta; mostrar atribuídos, iniciantes e ativados |
| Benefício incremental | Casos que atendem ao critério pré-registrado ÷ todos os atribuídos; evidência por caso | 14 dias; desconhecidos separados, falhas não removidas |
| Esforço comparado | Diferença entre processo habitual e Compor nos pares observados | Preparação, aprendizagem, revisão e saída; pares incompletos descritos |
| Uso independente | Conclusões sem orientação por passo ÷ todos os atribuídos | Assistência registrada, não ocultada |
| Preservação | Sobrescritas silenciosas, fatos indevidos aceitos e perdas de trabalho por cenário/campanha | Zero nos cenários de aceite; falha crítica bloqueia entrega afetada |
| Uso externo confirmado | Pessoas com uso confirmado ÷ ativados | Até 60 dias; exportado não equivale a publicado |
| Reutilização elegível | Retornos voluntários ÷ pessoas com nova ocasião compatível observada | Até 60 dias; mostrar também sem ocasião e sem resposta |
| Aceitação paga | Pagamentos confirmados ÷ qualificados atribuídos ao braço pago | Após G0 e janela fixada; informar ofertas apresentadas e recusas |
| Devolução | Compras devolvidas ÷ compras com janela contratual completa | Pedidos pendentes separados; contrato ainda por definir |
| Contribuição | Receita líquida menos custos variáveis atribuídos, incluindo atendimento valorizado | Por campanha/coorte, com aquisição e manutenção explicitadas |

Abrir a saída fora do app e restaurar o projeto verificam entrega e continuidade, sem criar outra definição de ativação. Para toda razão, denominador zero torna a taxa indefinida. Não responder permanece desconhecido; ausência de nova ocasião não significa abandono.

Não há baseline medido nem meta comercial validada. O ensaio gratuito/pago anterior propõe até dez qualificados ou 14 dias de recrutamento, o que ocorrer primeiro, como limite de esforço. Cada atribuído conserva a janela completa de uso após disponibilidade real; a janela de oferta é registrada separadamente. Amostra pequena não escolhe preço vencedor. Fixar capacidade, orçamento, suporte, condições e critério antes de executar. Sem acordo operacional, não iniciar a oferta.

Avançar apenas quando a evidência mostrar benefício incremental em episódios independentes, preservação e custo plausível; pagamento e repetição entram depois dos gates aplicáveis. Rever quando só um formato/recorte funciona ou o ganho depende de apoio intenso. Interromper a entrega afetada se houver perda de trabalho, alteração factual indevida, acesso oficial inviável ou impossibilidade de cumprir a promessa. Falta de ganho é resultado válido, não motivo para mover o critério após observar os dados.

**Propostas adicionais de B1, pendentes de escolha para o protocolo:** avançar somente um novo ciclo limitado se mais da metade de todos os atribuídos demonstrar simultaneamente benefício incremental pré-combinado e conclusão independente, sem falha crítica e com custos completos; encerrar o recorte se dois ciclos delimitados, com revisão explícita entre eles, não mostrarem nenhum benefício incremental verificável. Esses números não foram validados nem constituem consenso humano. Até a escolha do protocolo, ficam registrados como alternativas decisórias, não como critérios já aprovados.

## Out of Scope

- Garantir vendas, CTR, CPA, ROAS ou produzir um “criativo vencedor”.
- Descobrir demanda ou substituir estratégia de aquisição do usuário.
- Publicação automática, compra de anúncios, gestão de mídia e atribuição automática.
- Vídeo, carrossel, editor universal, importação de todo formato e interoperabilidade plena com Canva.
- Cobrança executada, contrato comercial final, preço escolhido, planos ilimitados e revenda de uso do modelo.
- Trocar plataforma técnica, abrir o repositório, adquirir infraestrutura ou contornar elegibilidade do fornecedor.
- Implementar o aplicativo nesta rodada ou usar o debate simulado como aprovação humana de UX.

## Further Notes

### Rastreabilidade e hipóteses

O [dossiê](../pesquisa/2026-10-23-voz-do-cliente/README.md) preserva fontes, voz original, satisfações e dificuldades. A [primeira onda](../prospeccao/2026-10-23/README.md) guarda mensagens e evidências dos dez envios. O [debate](../debate/2026-10-23-reestruturacao/00-brief-e-categorias.md) registra categorias, posições e réplicas nominais.

Ficam abertas: intensidade e frequência do atrito no público principal; uma versus duas rotas por intenção; custo total de troca; entendimento da unidade campanha; necessidade de suporte; repetição e pagamento. Não é possível fechar essas questões apenas com subagentes.

Princípios RCD usados como heurísticas: promessa proporcional à prova, foco de ICP, valor antes de esforço de configuração, disciplina de funcionalidades, ativação em vez de cadastro e cautela com A/B de amostra pequena. Fontes e limites de acesso estão nos pareceres D1/B1; os casos citados na skill não são resultados do Compor.

Esta spec substitui, para a próxima validação, os pontos de promessa, qualificação, quantidade obrigatória de rotas, ativação e monetização da documentação de 22/10. Os originais estão preservados no [histórico de 22/10](../historico/2026-10-22/LEIA-ME.md); contratos técnicos não alterados permanecem em vigor como propostas. Implementação, cobrança e decisões do fornecedor conservam seus gates próprios.
