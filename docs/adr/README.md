# Decisões de arquitetura

Para entender o código atual, comece pelo [mapa da arquitetura](../architecture.md). Este índice preserva o estado de cada registro. `accepted` identifica uma decisão aceita no contexto do documento; não demonstra que tudo foi implementado ou continua vigente. `proposed` permanece proposta. `recorded` documenta a implementação observada, sem conceder uma aprovação histórica ausente.

| ADR | Estado registrado | Leitura |
| --- | --- | --- |
| [0001](0001-contexto-local-e-colaboracao-github.md) | accepted | Contexto local e colaboração opcional pelo GitHub |
| [0002](0002-organizacao-e-fluxo-individual.md) | accepted | Organização e operação individual da v0 |
| [0003](0003-memoria-integral-da-organizacao.md) | accepted | Memória integral na proposta inicial |
| [0004](0004-tres-perfis-de-teste.md) | accepted | Perfis de acesso para testes |
| [0005](0005-observabilidade-centralizada-mlflow.md) | accepted | Observabilidade MLflow na direção anterior |
| [0006](0006-feedback-e-evolucao-do-harness.md) | accepted | Feedback humano e evolução do harness |
| [0007](0007-arquitetura-web-e-byok.md) | accepted | Direção web com BYOK e dados gerenciados |
| [0008](0008-memoria-proativa-e-observabilidade.md) | accepted | Memória proativa e observabilidade autorizada |
| [0009](0009-mcp-capacidades-compor.md) | accepted | MCP próprio para capacidades do Compor |
| [0010](0010-motor-recomendacao-phoenix-e-mcp-dual.md) | accepted | Phoenix e adaptação MCP Dual |
| [0011](0011-agents-api-e-mcp-remoto.md) | proposed | Proposta de Agents API gerenciada e MCP remoto |
| [0012](0012-arte-integral-e-deliberacao-adaptativa.md) | accepted | Arte integral, conversa adaptativa e decisão humana |
| [0013](0013-agile-deliberation-no-mcp.md) | Decisão descrita no corpo | Código e adaptação rastreável do Agile Deliberation |
| [0014](0014-frontend-next-typescript.md) | accepted | Frontend Next.js em TypeScript estrito |
| [0015](0015-backend-dados-e-autorizacao.md) | recorded | Backend, dados e autoridade por operação |
| [0016](0016-agente-api-e-ferramentas.md) | recorded | Runtime gerenciado e ferramentas do agente |
| [0017](0017-mcp-transportes-e-capacidades.md) | recorded | Fronteiras entre MCP remoto e stdio |
| [0018](0018-gates-qualidade-e-performance.md) | accepted | Bloqueios automáticos, diagnósticos e revisão |
| [0019](0019-phoenix-deterministico-no-bundle-web.md) | recorded | Phoenix puro no bundle web, autorização e proveniência sintética |
| [0020](0020-layout-pr17-e-conversa-adaptativa.md) | accepted | Layout do PR 17 com conversa adaptativa e decisão humana |
| [0021](0021-exploracao-visual-autonoma.md) | accepted | Exploração visual autônoma, referências e sinais reais de gosto |
| [0022](0022-busca-visual-e-sinais.md) | recorded | Busca visual externa e sinais explícitos autenticados |
| [0023](0023-referencias-e-conversa-flutuante.md) | accepted | Referências no centro e conversa flutuante recolhível |
| [0024](0024-exploracao-limitada-e-pecas-flexiveis.md) | accepted | Limites de exploração, links indicados e campos flexíveis |
| [0025](0025-prova-de-desfecho-da-exploracao.md) | recorded | Prova efêmera de conclusão ou recusa da exploração e implantação coordenada |
| [0026](0026-automacao-migrations-supabase.md) | recorded | Automação serializada de migrations, desabilitada até revisão da produção |
| [0027](0027-trava-automacao-migrations.md) | recorded | Trava persistente proposta para automação de migrations |
| [0028](0028-migracoes-atomicas-em-lote.md) | recorded | Migrations SQL e histórico nativo em uma transação |
| [0029](0029-agente-opinativo-e-pergunta-unica.md) | accepted | Fatos como ordem, gosto como sugestão e uma pergunta por turno |
| [0030](0030-variante-retoque-e-cards-no-canvas.md) | accepted | Variante e retoque no modelo de versões, com um card por variante |
| [0031](0031-faixa-de-contexto-publico-unico-e-revisao.md) | accepted | Faixa de contexto, público único e revisão simplificada |
| [0032](0032-gates-por-area-e-falha-rapida.md) | accepted | Gates por área alterada, falha rápida e minutos cobrados |
| [0033](0033-turbopack-e-analise-do-bundle.md) | accepted | Turbopack com análise do bundle antes e depois de mudanças no cliente |
| [0034](0034-entrada-leve-sem-runtime.md) | accepted | Entrada sem sessão em HTML sem JavaScript e gate que aceita zero scripts |
| [0035](0035-titulo-provisorio-e-falha-de-ferramenta.md) | recorded | Título provisório explícito e encerramento de ferramenta inválida |
| [0036](0036-remocao-da-interface-legada.md) | accepted | Remoção autorizada da interface legada e do seletor por variável |
| [0037](0037-referencias-sugeridas-e-retorno-ao-post.md) | accepted | Sugestões, consentimento por sessão, histórico próprio e retorno ao post |
| [0038](0038-chave-padrao-openai-no-vault.md) | accepted | Chave padrão no Vault, prioridade BYOK e separação de fontes |
| [0039](0039-publicacao-vercel-apos-migrations.md) | accepted; caminho substituído | Publicação após migrations; caminho por Action e depois por Vercel CI substituídos pelo ADR 0043 |
| [0040](0040-validacao-argumentos-acoes-estudio.md) | recorded | Argumentos verificados no domínio da prova, com idempotência e BYOK legado preservados |
| [0041](0041-referencias-com-conversa-lateral.md) | recorded | Referências como conteúdo principal e conversa lateral, com alternância compacta sem sobreposição |
| [0042](0042-leitura-estruturada-e-respostas-rapidas.md) | recorded | Leitura estruturada com opções fechadas, resposta rápida sem ferramentas e seleção de referências visível |
| [0043](0043-deploy-vercel-por-integracao-git.md) | accepted; atribuição automática verificada em 16/11 | Deploy pela integração Git da Vercel; check obrigatório e atribuição automática observados, com histórico de 15/11 preservado |
| [0044](0044-preparacao-guiada-e-estudio-por-post.md) | decisão aprovada; implementação local em verificação | Preparação guiada, início explícito da geração, configurações reunidas e estúdio dividido |
| [0045](0045-conversas-isoladas-por-post.md) | decisão aprovada; implementação local em verificação | Escopo de conversa por post, provas de continuidade e migração local preservada |
| [0046](0046-contexto-e-referencias-por-post.md) | decisão aprovada; implementação local em verificação | Objetivo e referências por post, snapshots, migração preservada e sinais com alcance explícito |

| [0047](0047-exclusao-logica-de-projetos.md) | implementado localmente | Exclusão lógica da lista web, confirmação, revisão esperada e histórico preservado |

| [0048](0048-nome-explicito-e-contexto-independente.md) | implementado localmente | Nome escolhido pela pessoa, contexto inicialmente vazio e preparação independente do título provisório |

| [0049](0049-lista-de-posts-preparacao-e-menu-lateral.md) | implementado localmente | Lista inicial vazia, preparação de cada post e ações num menu lateral recolhível |

| [0050](0050-configuracoes-do-projeto-em-pagina.md) | apresentação substituída pelo ADR 0053 | Configurações em página, seções no menu lateral e conteúdo de origem preservado ao retornar |

| [0051](0051-nome-confirmacao-e-exclusao-de-posts.md) | implementado localmente; migration não aplicada | Nome organizacional, criação confirmada e exclusão lógica de posts com catálogo sob RLS |

| [0052](0052-ia-inicial-e-jornada-unica-no-estudio.md) | decisão solicitada; implementação em validação | IA do Compor inicial sem geração automática, conversa minimizável e seleção única de referências |
| [0053](0053-integracao-da-main-e-decisoes-de-usabilidade.md) | implementado localmente | Integração da main com nomes/exclusão, modais aprovados e histórico de decisões preservado |
| [0054](0054-bancada-de-referencias-e-rascunho-v0.md) | decisão solicitada; implementação local em validação | Bancada com seleção e conversa, busca e geração distintas, última exploração preservada como v0 sem aprovação |
| [0055](0055-configuracoes-do-projeto-em-janela-modal.md) | decisão solicitada; implementado localmente | Configurações do projeto como janela modal sobre o estúdio, com X para fechar, substituindo só a dimensão de viewport do ADR 0053 |
| [0056](0056-navegacao-por-url-e-organizacao-do-estudio.md) | implementado no PR 54; verificação em andamento | URLs de projeto/post, retomada na página inicial, trilho de projetos e ações junto ao post |
| [0057](0057-verificacao-por-goals-em-tres-camadas.md) | direção e spike local aprovados | Goals para agentes de desenvolvimento/QA, evidência offline/web/integração real, AX explícita e preservação dos delays |

| [0058](0058-referencias-focadas-e-aprendizados-do-perfil.md) | implementado localmente | Referências em página, conversa sob demanda e perfil consultável após exclusão lógica de projetos |
| [0059](0059-aba-referencias-dentro-do-modal.md) | implementado localmente | Referências das configurações e “Escolher mais referências” abrem a bancada em janela modal |
| [0060](0060-inspecao-de-tentativa-sem-marcador.md) | implementado localmente | Inspeção restrita de tentativa sem marcador, com prova vinculada à credencial e sem efeitos |

| [0061](0061-lotes-paralelos-e-recibos-de-planejamento.md) | camada de banco implementada localmente; migration remota não aplicada | Reserva atômica de três imagens, prova de planejamento, revisão por lote e exclusão durante pendências |
| [0062](0062-reconciliacao-explicita-da-exploracao.md) | implementação local em validação | Preservar marcador na interrupção e consultar o mesmo recibo ao voltar antes de novo gesto |
| [0063](0063-epoch-original-da-revogacao.md) | implementado localmente; migration remota não aplicada | Prova imutável do epoch da revogação, replay idempotente e CAS sem adotar atividade posterior de outra aba |
| [0064](0064-retomada-paralela-vinculada-a-intencao.md) | implementado localmente; migration remota não aplicada | Retomada de feedback paralela com capacidade ativa, CAS e recibo único por intenção |
| [0065](0065-fidelidade-de-imagens-pequenas-no-chat.md) | implementado localmente | Imagens pequenas preservam bytes e transparência no contexto visual do chat |
| [0066](0066-entradas-visuais-e-triagem-vinculadas-ao-pedido.md) | contratos/planner locais; candidatos bloqueados sem fonte autoritativa | Manifesto visual versionado, uploads obrigatórios, triagem assinada e recuperação sem reenvio |

Mudanças posteriores não apagam registros anteriores. Registre a parte substituída, sua razão, a fonte da decisão e a evidência disponível. Não promova um status por inferência a partir da existência de código. Em especial, o uso atual da Agents API está documentado no ADR 0016, enquanto o status histórico do ADR 0011 permanece inalterado.
