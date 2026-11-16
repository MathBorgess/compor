# ADR 0047 — Exclusão de projetos da lista inicial

- Data: 15/11/2026.
- Fonte: pedido explícito de permitir excluir projetos na página inicial, com commit local e sem push.
- Estado: implementado para avaliação local; migration remota não aplicada.

Cada cartão oferece uma ação de exclusão separada de Abrir projeto, com confirmação que identifica o projeto e explica a retenção de posts, imagens e históricos. A exclusão é lógica: `projects.deleted_at` retira o projeto da listagem web, incluindo o menu do estúdio que usa a mesma API. Não representa apagamento definitivo, revogação de acesso ou interrupção de operações já autorizadas. Outros clientes existentes, incluindo MCP, mantêm seus contratos de acesso; não se altera RLS ou autorização histórica.

`DELETE /api/projects` valida origem, sessão, corpo estrito, UUID e revisão esperada. A RPC fixa `delete_project_from_list` verifica `auth.uid()` e propriedade no banco, bloqueia a linha e compara a revisão. A mesma exclusão repetida retorna confirmação sem incrementar novamente. Contas diferentes recebem `not_found`; o navegador não fornece a identidade. O adaptador usa o token pessoal, sem credencial administrativa ou permissão direta de UPDATE/DELETE.

A listagem web filtra `deleted_at IS NULL`. Os bytes privados, versões, evidências e armazenamento local permanecem intactos. Não há limpeza em cascata, restauração na interface ou garantia de eliminação de dados. A tela comunica essa distinção antes da confirmação.

O cartão só sai após confirmação validada do servidor. Cancelar não faz requisição. Falha, conflito ou resposta desconhecida conservam a lista e oferecem atualização manual, sem repetir a exclusão automaticamente. Um bloqueio síncrono impede clique duplo; respostas obsoletas não atualizam uma identidade posterior.

A migration `20261115000030_project_deletion.sql` é pré-requisito para a API real. O teste SQL de rollback usa apenas banco vazio e isolado, com guarda explícita, e não autoriza aplicação remota. Esta decisão acrescenta uma operação ao contrato anterior de listar/criar/renomear projetos; não substitui o histórico dos ADRs 0044–0046.
