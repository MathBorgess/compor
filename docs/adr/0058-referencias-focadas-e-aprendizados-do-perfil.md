# ADR 0058 — Referências focadas e aprendizados do perfil

- Estado: implementado localmente; publicação fora deste escopo.
- Data: 16/11/2026.
- Fonte: Matheus escolheu a segunda proposta visual e autorizou implementar suas regras de HTML/CSS, incluindo excluir projetos sem perder os aprendizados do perfil.

## Problema

A seleção de referências dividia o viewport com abas de configurações, seleção e conversa. As imagens tinham pouco espaço. A exclusão lógica de projetos já conservava dados, mas não oferecia um lugar independente para consultar os aprendizados depois de remover o último projeto da lista.

## Decisão

Referências usa uma página dedicada. A galeria e a conversa são superfícies alternadas do mesmo controlador montado. A escolha da fonte entre Pinterest, envio e propostas anteriores não inicia geração. Ampliar uma imagem e escolhê-la são ações distintas; desmarcar não registra rejeição de gosto. A contagem e a ação de continuar ficam no fluxo normal da página. Configurações do projeto continuam em modal.

A preparação inicial segue Contexto, IA, Referências opcionais e Pedido. Continuar nas referências abre diretamente o pedido do primeiro post. O catálogo só muda depois do recibo de `/api/posts`. Voltar às referências de um post preserva seu rascunho, versões e conversa. A candidata à v0 continua usando o contrato do ADR 0054, sem substituir uma imagem existente.

O contrato visual usa conteúdo de até 1.200 px, margem mínima de 32 px no desktop e 16 px no celular, cards com largura mínima de 300 px quando houver espaço, gap horizontal de 24 px e vertical de 32 px. Molduras são quadradas, com `object-fit: contain`. Até 767 px há uma coluna. Texto principal usa 16 px, texto secundário 14 px, controles pelo menos 44 px e foco visível de 3 px. A especificação e os exemplos semânticos estão no [desenho selecionado](../design/2026-11-16-referencias-focadas.md).

Excluir projeto permanece uma exclusão da lista, com confirmação, revisão esperada e a RPC autenticada existente. A ação fica no card e no menu do projeto. O estúdio preserva a gravação local antes de abrir a confirmação; a saída só ocorre depois de confirmar o recibo. Falha ou resultado incerto não causam repetição automática.

**Seu perfil**, no menu da conta, consulta escolhas, comentários e critérios com o projeto e o post de origem. Projetos excluídos da lista continuam nessa consulta. Não há snapshot no momento de excluir, nova inferência de preferências nem promoção de fatos de uma campanha a gostos gerais.

`POST /api/profile` aceita somente um offset validado. A origem e a sessão são verificadas no servidor. O adaptador lê projetos e sinais com o token pessoal, filtro de dono e RLS. Não usa credencial administrativa nem aceita identidade ou projeto enviados pelo navegador. A resposta é validada e não armazenável em cache. A UI confere a conta, invalida leituras após desmontagem e distingue falha de consulta de perfil vazio.

A consulta pagina 25 projetos, incluindo `deleted_at`, e lê até 500 sinais de cada fonte por página. Ao exceder esse limite, informa que os registros anteriores continuam armazenados; esta versão não oferece paginação individual dos sinais. Correções mantêm o vínculo com o registro anterior. Critérios são lidos do IndexedDB apenas para projetos autorizados pela resposta e aparecem como **Neste navegador**, com decisão, procedência e escopo. Não são sincronizados entre dispositivos.

## Preservação e supersessão

Esta decisão substitui a apresentação das referências em modal ou bancada simultânea dos ADRs 0053, 0054, 0055 e 0056. Também substitui a parada obrigatória na lista de posts ao terminar a primeira preparação descrita no ADR 0051. Conserva os demais contratos desses registros.

O indicador da espera de seleção acompanha a programação e o cancelamento do timer existente, sem criar outro relógio. Ele explica os 5 segundos sem alterações ou digitação para verificar a seleção. O intervalo de lote usa `role=timer` sem anúncio a cada segundo.

Não muda schema persistido, RLS, credenciais, consentimento do Pinterest, geração mediante pedido explícito, lotes de três, estabilização de 5 segundos, intervalo de 15 segundos, pausas por falta de resposta ou tratamento de resultado desconhecido. Não cria migração nem elimina dados. A exclusão não revoga permissões existentes do MCP, conforme ADR 0047.

## Verificação e limites

A [revisão visual](../../design-qa.md) registra o estado final e as capturas. O [relatório de implementação](../quality/2026-11-16-referencias-e-perfil.md) registra comandos, resultados e limitações. Testes usam dados sintéticos e fornecedores simulados. A retenção é verificada sobre as migrations existentes em PGlite; isso não comprova isolamento entre contas reais, login externo, latência paga ou implantação. O gate Docker da issue 51 permanece independente e opcional.

## Adendo (23/11/2026) — Referências opcionais no funil ultralinear de 2 telas

Por decisão de Matheus no plano aprovado em 23/11/2026 (Bloco 2, item 1, em conjunto com os adendos dos [ADRs 0044](0044-preparacao-guiada-e-estudio-por-post.md) e [0073](0073-referencias-e-primeiro-pedido.md)):

### O que muda ou é substituído

- Na seção *Decisão* (2º parágrafo), ficam substituídas no caminho feliz **quando `defaultAvailable === true`** (`GET /api/ai/credential-status`, [ADR 0038](0038-chave-padrao-openai-no-vault.md)) as frases `"A preparação inicial segue Contexto, IA, Referências opcionais e Pedido. Continuar nas referências abre diretamente o pedido do primeiro post."`.
- Sob o `<JourneyStepper>` de 3 macro-fases (`1. Projeto e contexto` → `2. Criar no estúdio` → `3. Salvar e postar`), a preparação inicial unifica contexto e barra inline de IA na **Tela 1 (`Projeto e contexto`)** (`<ProjectContextUnified>`, `"IA do Compor pronta · incluída"`, `"Usar minha chave OpenAI"`, `<ReviewDisclosureBadge compact />`). **Referências** deixam de ser etapa obrigatória entre uma tela dedicada de IA e uma tela intermediária de pedido (`prepare-post`), permanecendo opcionais e acessíveis sem bloquear a entrada direta na **Tela 2 (`Estúdio`)** via `"Ir para o primeiro post →"` (após confirmação do catálogo em `/api/posts`).

### O que permanece inalterado

- **Zero geração automática** ao criar projeto, editar contexto, receber `defaultAvailable === true`, escolher fonte ou abrir Referências, recarregar, selecionar `POST_ANGLE_STARTERS` ou entrar no Estúdio.
- **Fallback e credenciais**: quando `defaultAvailable === false`, permanece a etapa explícita de escolha/conexão de IA; BYOK explícita mantém prioridade sem fallback para a chave padrão ([ADR 0038](0038-chave-padrao-openai-no-vault.md)); `workflow.aiPreference='default'` ([ADR 0052](0052-ia-inicial-e-jornada-unica-no-estudio.md)) e isolamento de conversas ([ADR 0045](0045-conversas-isoladas-por-post.md)) permanecem intactos.
- Página dedicada de Referências, alternância galeria/conversa no mesmo controlador montado, ampliar ≠ selecionar, desmarcar ≠ rejeição, modal de configurações, alteração de `project_posts` somente após recibo de `/api/posts`, retorno do post preservando rascunho/versões/conversa, transferência condicional da candidata à v0 ([ADR 0054](0054-bancada-de-referencias-e-rascunho-v0.md)), layout responsivo (`1.200 px`, `767 px`), exclusão lógica, **Seu perfil** (`POST /api/profile` sob RLS), timer de 5 s, `role=timer` de 15 s, lotes de 3, consentimento do Pinterest, geração mediante pedido explícito, tratamento de resultado desconhecido e MCP ([ADR 0047](0047-exclusao-logica-de-projetos.md)).

### Verificação

- Validar em testes de navegador que Referências permanece acessível de forma opcional e preserva rascunho/seleção/conversa ao retornar ao post, e que `"Ir para o primeiro post →"` entra no Estúdio sem iniciar geração automática (implementação da UI em curso na etapa correspondente).
