# Plano da reformulação do fluxo do Compor

Data: 15/11/2026. Branch: `feat/frontend-usability`, criada da `main` local em `513e966`.

Estado: implementação completa autorizada pela pessoa usuária em 15/11/2026, após aprovação do fluxo. A avaliação manual será feita localmente quando o conjunto estiver pronto. Substitui o planejamento da tentativa cancelada; aquela implementação não será reaproveitada implicitamente.

## Resultado esperado

Preservar as funcionalidades e a identidade visual do Compor, reorganizando o percurso inteiro em torno da orientação. A pessoa deve reconhecer o projeto e o post atuais, entender o próximo passo e conseguir voltar sem perder o trabalho.

Fluxo aprovado na conversa:

1. Projetos: informar a ideia geral e criar um projeto, ou retomar um existente.
2. Contexto: perguntas progressivas sobre oferta, público e objetivo, aproveitando o que já foi informado.
3. IA: escolher a IA do Compor, quando disponível, ou conectar a própria chave OpenAI.
4. Referências opcionais: buscar, enviar imagens, pedir propostas visuais ou seguir sem referências.
5. Novo post: descrever a peça que a pessoa quer criar, em um novo pedido.
6. Estúdio: conversa à esquerda e criação à direita; ambas recolhíveis e expansíveis. No compacto, alternância entre Conversa e Post.

Depois da preparação, um acesso a Configurações do projeto reúne contexto, referências, IA e os recursos avançados de persona, direção, critérios e materiais já disponíveis. Posts do projeto apresenta as peças e permite criar outra. Cada post tem sua conversa e suas versões; o contexto geral é compartilhado.

Criar projeto, preencher contexto, escolher/conectar IA, abrir referências, abrir um post ou recarregar a página não iniciam imagens. A exploração começa por pedido explícito; o pedido de criação de um post é separado da ideia geral do projeto. Escolher o fornecedor de IA não substitui o pedido de gerar.

## Contrato e limites

Aplicar o [AGENTS.md](../../AGENTS.md), a [arquitetura atual](../architecture.md), o [índice de ADRs](../adr/README.md) e os [gates](../quality/gates.md). Documentos históricos não substituem o contrato atual.

As duas mudanças funcionais aprovadas são o novo gatilho de início da geração e a separação das conversas por post. Serão registradas como decisões, não disfarçadas de mudanças de rótulo. Preservar:

- identidade autenticada, origem, propriedade por operação e RLS; um identificador no navegador não prova autorização;
- chave própria somente em memória da sessão, chave do Compor somente no servidor, ausência de fallback de BYOK inválida e separação de fontes, provas, sessões e recuperação;
- geração sequencial, lotes de três, intervalo visível de 15 segundos, parada após duas rodadas sem retorno e espera pela resposta da seleção; sair das referências interrompe novos despachos, sem prometer cancelar uma chamada já enviada;
- consentimento externo por sessão da conta, distinção entre sugestão e seleção e origem das referências;
- fatos declarados, hipóteses, critérios, decisões humanas e palavra final do criador;
- arte integral, legenda separada, versões sem sobrescrita, distinção entre post, variante e retoque e regras de aprovação;
- recuperação, revisão esperada, idempotência, recibos e ausência de repetição automática de resultado incerto.

Continuar com OpenAI; suporte a outros fornecedores fica fora deste trabalho. Reutilizar marca, tipografia, paleta, componentes e padrões existentes. Não incluir redesign decorativo, mudança de motor, migração para Agents SDK, publicação automática, sincronização completa das conversas em nuvem ou instalação global/upgrades/flags do Next por conveniência.

## Base técnica observada

- `studio-app.tsx` concentra criação, seleção de rascunhos, referências, versões e composição do estúdio. O primeiro acesso hoje abre referências e pode habilitar a exploração com a ideia inicial.
- `studio-domain.ts` e `studio-state.ts` mantêm um estado validado por conta/projeto. `messages` é uma coleção do projeto; mensagens podem ter contexto de peça/versão ou contexto nulo. Não basta filtrar a apresentação para obter conversas independentes.
- `StudioChat` mantém marcadores de continuidade/recuperação por conta/projeto, além da fonte da credencial. Sessões, pendências, leituras de referência, respostas rápidas e efeitos também precisam ter seu escopo revisado.
- IndexedDB guarda estado criativo e imagens locais. Supabase guarda projetos, versões, ativos privados e metadados técnicos. Essa distribuição permanece como ponto de partida; não prometer persistência remota onde hoje ela não existe.
- O frontend usa Agents API gerenciada através de `packages/agents-api`. Rotas, ferramentas, assinaturas e reservas continuam sendo contratos reais, mesmo quando a revisão visual usa fornecedores simulados.

## Forma de execução

Cada etapa entrega um recorte utilizável na aplicação real. Pela autorização posterior de 15/11/2026, implementar o conjunto sem esperar uma aprovação entre etapas, executar os checks pertinentes e disponibilizar a aplicação local para avaliação ao final. Incorporar o feedback posterior em novos commits locais.

Separar os estados de progresso: em implementação; pronta para testar localmente; ajustes solicitados; validada pela pessoa; verificação técnica concluída. Aprovação visual não equivale a Quality gate aprovado. Verificações técnicas da mesma etapa podem continuar enquanto a pessoa testa, sem alterar a tela sob avaliação sem avisar.

Não abrir cada etapa com uma nova análise completa do repositório. Usar o mapa e os contratos já identificados, ampliando a investigação apenas quando uma mudança ou falha justificar. Não criar telas de demonstração paralelas à interface de produção.

## Etapa 0 — Ambiente local e referência de comparação

Entrega: um endereço estável, preferencialmente `http://127.0.0.1:3000`, funcionando no navegador comum da pessoa, com um único comando local para iniciar e outro para encerrar. Confirmar a porta antes de informá-la e nunca encerrar processos alheios para ocupá-la.

- Conferir dependências instaladas e seguir os lockfiles e a sequência do guia atual. Instalar só o que estiver faltando para a verificação pertinente.
- Preparar um serviço local de fixtures para sessão, projetos, conversas, referências, imagens, versões e aprovação. Servir os componentes reais do Next e executar o domínio, o armazenamento e a navegação reais. Simular as fronteiras externas, não reimplementar as telas.
- Usar configuração sintética isolada e impedir que requisições não simuladas atinjam fornecedores ou dados de produção. As fixtures devem obedecer aos schemas atuais e acompanhar suas mudanças.
- Disponibilizar estados normal, vazio, espera, falha confirmada e resultado incerto, sem chamadas pagas. Identificar imagens e conta de teste como fictícias. Permitir revisar os fluxos já entregues sem depender de interceptação exclusiva do navegador automatizado.
- Manter scripts, configuração, dados, capturas e instruções específicas desse ambiente em pasta privada, excluída por `.git/info/exclude`. Nada disso será enviado ao GitHub. Testes automatizados e fixtures reutilizáveis de contratos pertencem aos locais de testes do repositório, sem dados pessoais ou segredos.
- Verificar teclado, desktop e compacto; registrar a referência visual e os fluxos antes da mudança.
- Verificar cedo a execução dos testes no Windows. Falhas de caminho, processos ou ferramentas serão distinguidas de regressões. Se houver correção de portabilidade necessária, fazer um recorte próprio, com testes e sem skips, aumento de limites ou redução de asserções.
- Executar build/performance em saída independente da usada pelo servidor de revisão. Não apagar ou reconstruir o `.next` do servidor que a pessoa está usando.

Validação da pessoa: abrir o endereço, criar e reabrir um projeto fictício, confirmar que o servidor permanece disponível e reconhecer os dados de teste. Nenhuma tela nova é considerada entregue nesta etapa.

## Etapa 1 — Criação do projeto e contexto guiado

Entrega: telas 1 e 2, com distinção clara entre preparar projeto e criar post.

- Refinar a tela de projetos: explicação de projeto versus post, ideia geral, ação de criar e lista de retomada.
- Criar navegação explícita para as etapas de preparação, com indicação da etapa, Voltar e Continuar. Não inferir a tela apenas pela existência de texto, imagem ou rascunho.
- Apresentar as perguntas de contexto progressivamente, reutilizando briefing, público canônico, fatos e estados já existentes. Não duplicar perguntas já respondidas nem tornar todos os detalhes obrigatórios.
- Preservar texto, título provisório e revisão; a ideia inicial permanece contexto do projeto, sem ser mostrada como mensagem aguardando reenvio no chat do post.
- Incluir desde este recorte a guarda que impede explorar/gerar durante criação e contexto, inclusive com chave já conectada.
- Definir persistência da etapa de preparação e retomada segura, sem gravar credenciais ou transformar preferências em autorização.
- Projetos antigos não serão obrigados a refazer o assistente nem terão conteúdo preenchido por suposição. Contexto incompleto poderá ser revisado nas configurações.

Verificação: criação sem duplicação por Enter/clique, composição de texto, toque, retorno e recarga; preservação de público/fatos e criação incerta. Contadores de chamadas comprovam zero geração nessa preparação.

Validação da pessoa: criar projeto, responder contexto, voltar, corrigir uma resposta e retomar sem perder o preenchimento. A sequência seguinte deve usar os recursos existentes disponíveis, sem simular botões funcionais que não têm implementação.

## Etapa 2 — Escolha da IA e referências opcionais

Entrega: telas 3 e 4 e geração exploratória por pedido explícito.

- Apresentar IA do Compor e chave própria com linguagem simples; identificar OpenAI no campo de conexão. Exibir disponibilidade real, conexão, falha, troca e desconexão sem conteúdo secreto.
- Separar preferência, disponibilidade, autorização e pedido de geração. Conectar ou selecionar IA não dispara exploração.
- Oferecer busca externa, envio de imagem, pedido de propostas visuais e continuação sem referências. Exibir seleção, origem e remoção.
- Pedir consentimento externo no ponto já previsto; recusar ou pular não impede continuar. Não carregar prévias externas antes do consentimento.
- Introduzir uma ação explícita para iniciar a exploração. Preservar o controlador, seus lotes, pausas, limites e recuperação; abrir/reabrir a área ou recarregar não equivale a clicar nessa ação.
- Preservar as leituras e respostas rápidas de referências, com retorno visível dentro do contexto de referências. Antes de existir uma conversa de post, não criar mensagens atribuídas a uma peça por suposição. O contexto de análise de referências do projeto precisa ser distinguido das conversas dos posts.
- Oferecer estados compreensíveis de busca, geração, intervalo, espera por resposta, pausa e resultado desconhecido.

Verificação: continuar sem IA e editar manualmente; IA indisponível; BYOK inválida sem fallback; seleção de fonte sem gerar; referências sem consentimento; lotes e retomadas por ação explícita; nenhuma repetição incerta. A criação efetiva com IA só é oferecida quando os requisitos atuais da operação estão satisfeitos.

Validação da pessoa: percorrer com e sem referências; conectar uma credencial sintética, consultar propostas fictícias, selecionar/remover e continuar. O modo de testes não deve solicitar uma chave real.

## Etapa 3 — Posts do projeto, conversas e compatibilidade

Entrega: lista de posts, novo pedido da tela 5 e conversas realmente independentes.

- Agrupar peças pelo `pieceId`, combinando rascunhos locais e versões remotas, sem confundir uma versão com um novo post. Identificar cada post com os dados disponíveis, miniatura e estado real. Não criar um novo cadastro remoto de títulos por conveniência.
- Criar e abrir posts mantendo contexto geral compartilhado. Uma nova peça começa com pedido próprio e conversa própria; o contexto do projeto não reaparece como mensagem humana já enviada.
- Versionar o contrato local para separar mensagens, rascunho do compositor, continuidade, tentativas, leituras e respostas por conversa/post. Manter limites de armazenamento e dar erro explícito quando atingidos, sem apagar histórico silenciosamente.
- Propagar o escopo pelo payload HTTP, validação runtime, sessões gerenciadas, provas, recibos e recuperação pertinentes. Rever implementação JavaScript, declarações e testes juntos. Filtrar bolhas no frontend não é suficiente.
- Contexto enviado ao modelo deve conter o projeto e o post destinatário, sem transportar a conversa de outro post. Uma ferramenta que abre/cria outra peça precisa tratar a mudança de destino explicitamente, sem reaproveitar a sessão indevidamente.
- Capturar a origem das operações assíncronas. Uma resposta do post A que chega enquanto B está aberto permanece vinculada a A e não aplica imagem/texto/versão em B. Trocar de post não autoriza repetir a operação.
- Manter a renomeação provisória como oportunidade do projeto, não uma proposta nova a cada post. Preservar revisões e confirmação da pessoa.

Migração: preservar o estado anterior antes da conversão; usar mensagens com contexto inequívoco para associar histórico a um post. Conteúdo sem associação segura permanece em histórico anterior do projeto, acessível para consulta, sem alimentar automaticamente todos os posts. Migrar de forma validada, idempotente e atômica; falha não descarta o original. Cobrir abas antigas ainda abertas e impedir que um cliente anterior sobrescreva o estado migrado. Preservar identificadores de pendências e consultá-las sob seu vínculo original, sem executar novamente nem converter uma prova antiga em autorização de outro post.

A proposta inicial conserva a distribuição local/remota existente. O contrato de conversas e a representação do escopo nas reservas serão fechados antes de alterar o código da camada. Se for necessária evolução SQL para manter esse vínculo, ela integra esta etapa, com migração aditiva, RLS, testes e ensaio isolado; não será aplicada à produção nesta sequência.

Verificação: dois posts e duas conversas, troca repetida, reload, escrita concorrente, resposta atrasada, credencial trocada, versões e aprovações separadas, contextos legados nulos e falha de migração. Testar também as ferramentas de novo post/abrir versão e o contrato próprio do MCP externo quando um pacote compartilhado mudar.

Validação da pessoa: criar dois posts no mesmo projeto, pedir alterações diferentes, alternar e reabrir; cada conversa e criação devem permanecer no lugar certo.

## Etapa 4 — Estúdio com conversa e criação lado a lado

Entrega: tela 6 com conversa à esquerda e criação à direita, dentro da identidade atual.

- Mostrar projeto/post atuais e priorizar as ações pertinentes ao post aberto.
- Permitir ajustar a divisão, recolher e expandir cada área, preservando conteúdo, foco e tamanho útil. Oferecer operação por teclado além do ponteiro.
- No compacto, alternar Conversa/Post sem apagar a mensagem ou ocultar o controle de envio; acomodar o teclado virtual e evitar rolagens concorrentes desnecessárias.
- Mostrar espera, perguntas, propostas, resultado confirmado e recuperação onde a pessoa está trabalhando, sem percentuais inventados nem garantias de cancelamento remoto.
- Reutilizar criação de arte integral, campos, imagem-base, marcações, variantes, retoques e histórico. Distinguir o que orienta a próxima geração do que altera uma imagem existente.
- Durante um turno, continuar seguindo o processamento e as decisões já existentes; o pedido de post não garante imagem imediata se precisar esclarecer algo.

Verificação e validação: gerar uma resposta/imagem fictícia, responder uma pergunta, pedir ajuste, recolher/expandir, mudar largura e retornar ao post. Conferir foco, limites das áreas, ausência de sobreposição e vínculo da nova versão à origem.

## Etapa 5 — Configurações reunidas, revisão e saída

Entrega: fechamento da navegação e das ações de conclusão.

- Reunir contexto, referências, IA, persona/direção/critérios e materiais num acesso de Configurações do projeto. Preservar todas as capacidades atuais, com ajuda progressiva e estados reais de alterações locais/remotas.
- Voltar ao mesmo post com conversa, compositor, imagem e versões preservados. Mudar o contexto não refaz imagens existentes. Mudar a fonte da IA pausa novas solicitações e preserva o vínculo das tentativas anteriores.
- Distinguir salvar versão, aprovar, revisar, baixar PNG e copiar legenda. Exibir projeto/post/versão corretos na revisão.
- Preservar bytes/formato da arte integral e legenda separada; exportar não salva, aprova ou publica. Manter inicialmente o contrato de nome do arquivo; qualquer mudança terá decisão própria, sem alteração implícita do ADR 0031.
- Oferecer retorno para ajustes e acesso à lista de posts sem perder o trabalho. Tratar feedback de download/cópia e resultados não confirmados com texto acessível.

Verificação e validação: editar configurações e retornar; salvar, aprovar, baixar, copiar; alternar o post durante um download/consulta pendente; recuperar conflito sem sobrescrever rascunho. Repetir no compacto.

## Etapa 6 — Percurso completo e encerramento técnico

Entrega: sequência integrada validada, documentação atualizada e pendências explícitas.

- Repetir criar projeto → contexto → IA → referências opcionais → primeiro post → ajustes → nova versão → aprovação → segundo post → alternância → revisão/exportação.
- Repetir com projeto antigo, sem referências, sem IA, chave recusada, fonte trocada, conta trocada, falha local, conflito de escrita e resultado incerto.
- Verificar semântica HTML, rótulos, ordem de foco, Escape, teclado, movimento reduzido e estados anunciados; registrar limitações de leitores de tela/teclados reais não exercitados.
- Executar os gates correspondentes ao diff final, revisar a separação cliente/servidor e o bundle, consolidar evidências e distinguir verificação técnica de aprovação da pessoa.
- Não iniciar push, PR, merge, migration remota ou deploy. Esses atos aguardam comando explícito.

## Validação local pela pessoa

Em cada entrega, informar: endereço confirmado; tela/recorte alterado; até cinco ações para experimentar; o que é simulado; o que ainda não integra o recorte; resultado dos checks executados. Deixar o ambiente disponível, sem alterar a porta, apagar o armazenamento ou reiniciar a aplicação durante a avaliação sem avisar.

Preparar dados locais persistentes e uma forma explícita de reiniciar apenas os exemplos. O reset de cenários não deve limpar dados reais nem projetos de outro ambiente. Capturas e instruções operacionais permanecem privadas.

Quando houver necessidade de avaliar geração real, separar isso da revisão com fixtures: usar as rotas reais e um ambiente de dados isolado, com a chave fornecida pela pessoa na interface ou configuração de teste própria. Não copiar credenciais de produção. Pedir a chave somente quando a etapa precisar dela; testes automáticos não autorizam chamadas pagas. Registrar a evidência real separadamente, sem converter resultados simulados em prova de integração ou qualidade criativa.

## Checks e documentação

Durante o desenvolvimento, executar testes focados que observem o comportamento alterado. Antes de concluir um recorte, executar os checks exigidos para suas áreas; não repetir uma bateria já aprovada sem mudança, falha ou preocupação nova que justifique.

| Mudança | Verificação prevista |
| --- | --- |
| Apenas este plano Markdown | Revisão do conteúdo e `git diff --check`; não executar geração/build por uma mudança documental |
| App web | `quality:lint`, `quality:typecheck`, `quality:test`, `quality:browser`, `quality:build`, `quality:performance` |
| Pacotes/contratos/dados | Checks web e `quality:unit`; declarações, schemas e testes atualizados juntos |
| Scripts/workflows ou áreas adicionais | Mapeamento de `changed-areas.mjs`; executar todas as áreas ativadas, incluindo site quando aplicável |
| Migração SQL, se necessária | Contratos, RLS, compatibilidade e ensaio em banco isolado; nenhuma aplicação remota implícita |

No Windows, documentar invocações equivalentes necessárias por particularidades do shell, sem dizer que um comando literal passou quando falhou. Não desabilitar testes, trocar limites ou relaxar orçamentos. Uma falha preexistente precisa de evidência separada e não transforma o gate em aprovado.

Não executar browser e Lighthouse ao mesmo tempo. Preservar os limites atuais: 250.000 bytes gzip iniciais, 300.000 totais, LCP 2.500 ms, TBT 200 ms e CLS 0,1 em cinco medições. Capturar/exportar `next analyze` antes/depois quando houver nova dependência de cliente, mudança entre servidor/navegador ou orçamento apertado; usar `next-bundle-optimizer` conforme ADR 0033. Reutilizar dependências existentes por padrão. Respeitar as restrições de [skills do Next](../third-party/vercel-next-skills.md); `next-dev-loop` não autoriza instalar globalmente seu pré-requisito.

Documentação de produto acompanha o código entregue. Prever ADRs para (a) preparação guiada, gatilho explícito e organização do estúdio/configurações e (b) conversas por post, escopos, compatibilidade e persistência. Usar os próximos números livres na implementação. Atualizar arquitetura, índice de ADRs e trechos correspondentes do AGENTS.md quando a implementação entregar as novas decisões.

Precisar exatamente as substituições: início automático e chegada às referências do ADR 0037/decisões anteriores; contexto sempre exposto do ADR 0031; editor flutuante do ADR 0023 e layout de referências do ADR 0041 nos pontos alterados. Preservar fatos, geração em lotes, fontes/credenciais, recuperação e partes não substituídas. Avaliar reflexos nos ADRs 0035, 0038 e 0042 sem declará-los integralmente revogados.

## Commits e controle de progresso

Código, testes e documentação pertinente ficam em commits locais coerentes. A implementação está autorizada; envio ao GitHub continua dependendo de comando explícito. Commits previstos, ajustáveis ao recorte efetivo:

1. `docs: record guided studio implementation plan`
2. `fix: support local quality checks on Windows` — somente se a necessidade for confirmada, sem exceções aos gates.
3. `feat: guide project creation and context setup`
4. `feat: make AI setup and reference exploration explicit`
5. `feat: isolate post conversations and preserve legacy history`
6. `feat: organize project posts and new post requests`
7. `feat: compose chat and artwork in a split studio`
8. `feat: unify project settings and guide post review`
9. `test: verify the guided multi-post journey`

Recortes de contrato podem ter commits separados antes da UI consumi-los, mantendo a migração compatível e a mudança revisável. Não acumular todas as etapas num commit único. O ambiente específico da máquina permanece excluído. Nenhum commit será enviado ao remoto sem comando explícito.

| Etapa | Estado |
| --- | --- |
| Planejamento | Aprovado; implementação completa autorizada |
| 0 — Ambiente local | Preparado, privado e executável; verificação com Next e Chromium realizada |
| 1 — Projeto e contexto | Implementado; criação, perguntas e retomada em verificação final |
| 2 — IA e referências | Implementado; intenção explícita, fonte e retorno às referências verificados com fixtures |
| 3 — Posts e conversas | Implementado; escopos assinados, migração, dois posts e rascunhos separados verificados |
| 4 — Estúdio dividido | Implementado; divisão por teclado/ponteiro e alternância compacta verificadas |
| 5 — Configurações e saída | Implementado; contexto, IA, referências e recursos avançados reunidos; exportação em verificação final |
| 6 — Integração e fechamento | Suíte completa e medição finais em andamento; avaliação humana ainda pendente |

Não considerar uma etapa concluída apenas porque compila, está bonita na captura ou recebeu commit. Registrar separadamente os cenários verificados, a avaliação da pessoa e os impedimentos técnicos que restarem. Validação local não comprova CI Linux, deployment, isolamento entre contas reais ou qualidade das imagens geradas.
