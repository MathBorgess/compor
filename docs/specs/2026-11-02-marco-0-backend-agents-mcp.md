# Compor — especificação do marco 0: backend, Agents API e MCP remoto

**Estado:** especificação publicada no Jira para organizar o trabalho. As decisões de produto foram discutidas com Matheus; integrações, segurança e qualidade criativa ainda não foram demonstradas. O desenho integral e o ADR proposto continuam sujeitos à revisão; publicar ou rotular esta especificação não autoriza deploy nem testes pagos sem a decisão correspondente.

## Problem Statement

Matheus e a equipe precisam criar e retomar uma peça piloto de divulgação por um fluxo web simples e pelo Codex Desktop, compartilhando projetos e versões. O protótipo atual funciona como MCP local: depende de identidade e arquivos locais, não oferece autenticação e isolamento multiusuário em produção, e não implementa o backend web completo nem a geração de imagem do produto. A operação não deve exigir que a equipe mantenha um harness de agentes em uma máquina própria.

## Solution

Construir o backend do Compor em Next.js na Vercel, usando a OpenAI Agents API para gerenciar o loop do agente e um MCP remoto autenticado para as capacidades compartilhadas com o Codex. A pessoa entra com Google, fornece uma chave OpenAI apenas para a sessão web e cria uma direção criativa e uma peça piloto revisável. Projetos, versões e recursos privados são persistidos no Supabase com isolamento e autorização por operação. O Codex conecta à mesma conta sem depender da chave web. O custo estimado e o estado das tentativas são observados desde a primeira execução.

## User Stories

1. Como pessoa criadora, quero entrar com minha conta Google, para acessar meu trabalho no Compor.
2. Como pessoa criadora, quero que meus projetos sejam privados para minha conta, para que outras pessoas da equipe não os acessem automaticamente.
3. Como pessoa criadora, quero informar minha própria chave OpenAI no início da sessão web, para usar a IA com minha conta.
4. Como pessoa criadora, quero que minha chave não seja guardada permanentemente, para controlar sua permanência no produto.
5. Como pessoa criadora, quero ser informada se minha chave não tiver acesso, permissões ou saldo necessários, para corrigir o problema.
6. Como pessoa criadora, quero informar meu objetivo antes de concluir o setup de IA, para começar a organizar a divulgação.
7. Como pessoa criadora, quero abrir ou criar um projeto, para reunir material e decisões de forma recuperável.
8. Como pessoa criadora, quero descrever público, oferta, objetivo e ação desejada, para contextualizar a criação.
9. Como pessoa criadora, quero distinguir fatos confirmados dos pendentes, para evitar que uma proposta apresente hipóteses como fatos.
10. Como pessoa criadora, quero fornecer referências criativas, para orientar uma direção segundo meus objetivos.
11. Como pessoa criadora, quero seguir sem referências, para não depender de imagens externas.
12. Como pessoa criadora, quero que os recursos indiquem sua origem e o uso autorizado, para saber o que estou usando na peça.
13. Como pessoa criadora, quero receber direções criativas contrastantes, para comparar diferentes caminhos.
14. Como pessoa criadora, quero solicitar outras alternativas, para explorar sem ficar presa à primeira sugestão.
15. Como pessoa criadora, quero revisar e corrigir uma direção criativa antes de gerar a imagem, para manter controle sobre o resultado.
16. Como pessoa criadora, quero solicitar explicitamente a geração de imagem, para controlar quando uma operação paga começa.
17. Como pessoa criadora, quero usar a mesma chave de sessão na geração web e no agente quando ambas as APIs estiverem disponíveis para ela, para evitar outro setup de credenciais.
18. Como pessoa criadora, quero que a imagem-base seja solicitada sem texto, para compor textos editáveis separadamente.
19. Como pessoa criadora, quero revisar a imagem mesmo quando surgir texto inesperado, para não presumir que a geração atendeu à solicitação.
20. Como pessoa criadora, quero editar texto, preço e data como camadas, para corrigir informações sem regenerar a base.
21. Como pessoa criadora, quero revisar e copiar a legenda, para usá-la junto da peça piloto.
22. Como pessoa criadora, quero ver a origem da legenda, para distinguir texto informado por mim de proposta do agente.
23. Como pessoa criadora, quero salvar versões da peça, para recuperar escolhas anteriores.
24. Como pessoa criadora, quero abrir o projeto em outra sessão, para continuar sem perder o trabalho salvo.
25. Como pessoa criadora, quero informar novamente minha chave quando necessário, para continuar sem depender de salvamento permanente da credencial.
26. Como pessoa criadora, quero baixar o piloto em PNG, para revisar ou usar a composição fora do aplicativo.
27. Como pessoa criadora, quero que baixar o piloto não seja interpretado como aprovação, para manter a decisão de aceite explícita.
28. Como pessoa criadora, quero conectar o Codex Desktop à minha conta Compor, para acessar o mesmo projeto pela conversa.
29. Como pessoa criadora, quero autorizar essa conexão com minha conta Google/Compor, para controlar o acesso do cliente.
30. Como pessoa criadora, quero criar ou revisar e salvar uma peça pelo Codex, para continuar meu trabalho sem trocar obrigatoriamente para o navegador.
31. Como pessoa criadora, quero usar o Codex sem a chave informada na sessão web, para não duplicar esse segredo entre clientes.
32. Como pessoa criadora, quero transferir uma imagem autorizada do Codex para o projeto, para preservar a peça junto de suas versões.
33. Como pessoa criadora, quero ser informada se o Codex não tiver a capacidade de imagem ou transferência necessária, para não receber uma conclusão falsa.
34. Como pessoa criadora, quero receber um conflito quando outro cliente alterar a mesma versão, para não perder edições silenciosamente.
35. Como pessoa criadora, quero que uma imagem atrasada permaneça ligada à tentativa e versão que a originaram, para não sobrescrever uma alteração mais recente.
36. Como pessoa criadora, quero que o Compor preserve o trabalho já salvo após uma desconexão, para tentar retomá-lo.
37. Como pessoa criadora, quero saber quando o resultado de uma tentativa paga é desconhecido, para decidir se faço nova tentativa.
38. Como pessoa criadora, quero que uma tentativa incerta não seja repetida automaticamente, para reduzir cobranças e duplicações inesperadas.
39. Como pessoa criadora, quero entender que uma operação iniciada pode terminar após eu fechar o navegador, para avaliar o custo possível.
40. Como pessoa criadora, quero ver quando uma execução falhar ou estiver indisponível, para saber o que posso recuperar ou corrigir.
41. Como pessoa criadora, quero criar sem ativar perfil Phoenix, para usar o marco 0 sem personalização persistente.
42. Como pessoa criadora, quero que conteúdo e chaves não apareçam nos logs operacionais, para reduzir exposição desnecessária.
43. Como pessoa criadora, quero que o compartilhamento para avaliação dependa de autorização própria, para que criar uma peça não seja tratado como consentimento de estudo.
44. Como pessoa criadora, quero que o uso de uma referência externa dependa da autorização aplicável, para manter controle sobre o material enviado.
45. Como Matheus, quero medir duração, uso e custo estimado de cada tentativa desde o início, para avaliar a viabilidade do fluxo.
46. Como Matheus, quero distinguir custo do agente, da imagem e da infraestrutura quando houver dados disponíveis, para identificar onde estão os gastos.
47. Como Matheus, quero ver uso ou custo desconhecido como desconhecido, para não interpretá-lo como zero ou como cobrança confirmada.
48. Como Matheus, quero conferir custos faturados na conta apropriada, para comparar estimativas do produto sem fornecer chave administrativa.
49. Como Matheus, quero que o limite de gasto do teste real seja definido antes da execução paga, para controlar o experimento.
50. Como Matheus, quero que o MCP autentique e autorize cada operação por conta e projeto, para impedir acesso cruzado mesmo com identificadores conhecidos.
51. Como Matheus, quero que a credencial MCP seja distinta da chave OpenAI, para não usar uma credencial de faturamento como identidade do produto.
52. Como Matheus, quero que o harness do agente seja gerenciado pela OpenAI, para reduzir o loop e a infraestrutura de orquestração próprios.
53. Como Matheus, quero que uma função de imagem só atenda à chamada pontual do agente, para evitar reconstruir o loop no backend.
54. Como Matheus, quero que os dados locais do protótipo permaneçam intactos e não sejam importados, para começar a web com dados novos.
55. Como Matheus, quero observar separadamente falhas do app, MCP, armazenamento e provedor, para diagnosticar o fluxo sem atribuir sucesso a uma integração não testada.
56. Como Matheus, quero que disponibilidade de modelos, autenticação, transferência de imagem e recuperação sejam comprovadas, para não tomar um protótipo em processo como prova de produção.
57. Como Matheus, quero preservar as versões e a legenda ao editar uma peça, para que mudanças em um elemento não apaguem decisões anteriores.
58. Como Matheus, quero manter busca automática e recomendação de boards fora desta entrega, para concentrar o marco 0 no fluxo criativo básico.
59. Como Matheus, quero iniciar pela implementação do backend e chegar à interface mínima necessária para a jornada, para validar o fluxo completo.
60. Como Matheus, quero que o deploy e a entrada de convidados ocorram apenas após as decisões e verificações pertinentes, para distinguir código local de serviço efetivamente disponível.

## Implementation Decisions

- Usar Next.js e o endpoint MCP remoto na Vercel. Extrair seletivamente capacidades de direção e peças para um núcleo acessível às rotas do app e ao adaptador MCP; o protótipo não deve ser publicado sem adaptar identidade, estado e arquivos.
- Usar Agents API gerenciada para loop, sessões e chamadas de ferramentas; não implementar o loop com Agents SDK no backend. Um cliente oficial da API é permitido e não é o Agents SDK de orquestração.
- Configurar MCP autenticado como fronteira compartilhada por Agents API e Codex. A credencial da execução MCP é curta, limitada ao contexto autorizado e diferente da chave OpenAI; a expiração e a revogação devem ser verificadas.
- Usar login Google via Supabase Auth e Supabase Postgres/Storage privados. Aplicar RLS, permissões e verificação por operação; políticas do banco não substituem as do armazenamento. Não utilizar credencial administrativa como identidade da pessoa nem tratar ID de objeto como autorização.
- Manter a chave OpenAI somente em memória da sessão web e em trânsito protegido para as operações autorizadas. Não gravar em banco, armazenamento do navegador, prompts, argumentos de tool, resultados ou logs. Uma sessão fechada pode exigir reapresentar a chave.
- Verificar disponibilidade da geração integrada na Agents API. Se não atender, usar function tool no backend e Images API com a mesma chave; correlacionar a chamada com conta, projeto, versão, tentativa e autorização explícita. Atender a função não significa assumir o loop do agente.
- Codex conecta ao MCP por OAuth da conta Compor, acessa o mesmo projeto e usa as capacidades disponíveis no próprio cliente, sem chave da sessão web. A transferência autorizada de imagem e a compatibilidade OAuth devem ser provadas no Desktop; não presumir que existam apenas porque o protocolo suporta o formato.
- Persistir projeto, peça, versões, recursos e estado da tentativa como dados próprios do produto. Preservar a origem das versões e dos recursos; usar comparação da versão esperada e conflito recuperável. Não importar perfis ou peças locais existentes.
- Registrar estados de tentativa e reconciliar eventos/objetos após queda. Não tratar timeout ou stream encerrado como prova de falha; resultado e gasto podem permanecer desconhecidos. Deduplicar operações do produto quando possível e nunca repetir automaticamente uma chamada paga de resultado incerto.
- Solicitar imagem-base sem texto, manter texto e legenda editáveis e compor PNG; a saída pode violar a solicitação e precisa de revisão. A legenda guarda sua origem. Download, edição ou silêncio não são aprovação nem publicação.
- Medir desde o marco 0 latência, chamadas, modelo, uso e custo estimado por tentativa/peça, distinguindo agente, imagem e infraestrutura quando possível. Capturar dados ausentes como desconhecidos; uso reportado não equivale necessariamente à fatura. Não solicitar chave administrativa nem registrar segredos ou conteúdo criativo nos logs operacionais.
- Disponibilizar referências fornecidas pela pessoa ou nenhuma, preservando origem e alcance autorizado. Busca automática e ranqueamento de boards não são necessários nesta etapa.
- Escopo inicial: Matheus e equipe com isolamento por pessoa. Convidados externos dependem de verificações adicionais. Retenção de sessões pela OpenAI e residência dos serviços não são bloqueios escolhidos para o piloto.

## Testing Decisions

- Bons testes verificam comportamento observável e contratos externos, não detalhes internos ou implementação espelhada. Preservar uma fronteira integrada principal de backend por HTTP, exercitando as rotas do app e a superfície MCP sobre o núcleo compartilhado.
- Simular serviços OpenAI de forma determinística nas verificações repetíveis; usar banco e políticas reais em ambiente de teste isolado quando apropriado. Simulação não demonstra suporte ou qualidade dos serviços reais.
- Testar criação/retomada de projeto, direções, versões, edição de texto/legenda e download do piloto, sem confundir exportação com aprovação.
- Testar credencial efêmera e limites de confiança: duas contas, RLS do banco, políticas de Storage, autorização por operação, revogação, URLs/IDs de outra pessoa, tentativas de injeção e ausência de segredos/conteúdo em logs e resultados.
- Testar concorrência entre clientes, idempotência no domínio, falhas entre banco e armazenamento, desconexão, resultado desconhecido de geração e ausência de repetição paga automática.
- Testar métricas de duração e custo estimado com uso presente e ausente; não prometer valor faturado exato.
- Realizar prova integrada separada e controlada com Codex Desktop, MCP remoto, OAuth, transferência de imagem e, quando autorizado, Agents API, Images API e Supabase reais. Definir chave e limite antes de chamadas pagas; implantar apenas com autorização. Registrar ambiente, versões, resultado e limitações.
- Usar como referência os testes atuais de negociação MCP em processo/stdio e os testes do protótipo para linhagem, versão esperada e edição de texto/legenda. Esses testes não comprovam Agents API, rede, isolamento RLS ou produção.

## Out of Scope

- Perfil Phoenix, sinais persistentes, personalização, avisos de preferência, desfazer e exclusão de perfil: etapa 2.
- Busca externa automática, boards curados e ranqueamento de referências; MCP Apps; MLflow/Oracle inicial.
- Importação, alteração ou remoção dos projetos e perfis locais do protótipo.
- Guardar a chave OpenAI de forma duradoura; usar a chave web para autenticar o MCP ou exigir essa chave no Codex.
- Reconstruir o loop de agente no backend com Agents SDK; tratar uso ou estimativa como faturamento final garantido.
- Prometer qualidade criativa, disponibilidade da integração, proteção ou ganho econômico sem evidência; interpretar download como aprovação ou publicação.
- Publicação social, lançamento, entrada de convidados e deploy sem as decisões e verificações correspondentes.

## Further Notes

- As tarefas de implementação existentes são [SCRUM-19](https://compor-mathai.atlassian.net/browse/SCRUM-19) e [SCRUM-55](https://compor-mathai.atlassian.net/browse/SCRUM-55); a especificação as referencia e não as substitui. O fluxo web demonstrável está relacionado a [SCRUM-54](https://compor-mathai.atlassian.net/browse/SCRUM-54).
- A [arquitetura no Confluence](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/1376258) e o [diagrama de caixa branca](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/whiteboard/9961475) registram a direção proposta. O ADR de Agents API e MCP remoto é proposto; a arquitetura anterior permanece histórica até a decisão formal.
- Pontos pendentes de prova, não de decisão inventada: acesso à Agents API/Images API na conta real, geração de imagem integrada, OAuth e transferência no Codex, vida útil das credenciais e recuperação dos resultados.
- A especificação organiza o trabalho; não demonstra implementação, autorização para deploy, sucesso criativo ou validação de produto.
