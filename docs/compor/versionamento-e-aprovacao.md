# Linhagem, aprovação e revisão de projeto

Implementação local da migração `20261105000014_version_metadata.sql`. Ela depende das tabelas de projetos e versões existentes e deve ser aplicada depois da migração 00013, sem repetir migrações já auditadas. Nenhuma alteração remota ou deploy faz parte deste registro.

O conteúdo de `piece_versions` continua imutável. A tabela separada `piece_version_metadata` guarda a versão de origem e a aprovação, com RLS por proprietário do projeto e sem permissão de escrita direta aos papéis da aplicação. Uma versão salva pode receber aprovação explícita; uma versão derivada de uma origem aprovada herda a aprovação e preserva a versão, ator e data originais. A herança não representa nova revisão humana. Mensagens, referências e rascunhos não entram nessa tabela.

`save_piece_version_v2` compara a versão mais recente esperada, verifica a base na mesma peça e serializa a gravação pelo bloqueio do projeto. A primeira versão usa base zero na entrada e registra base nula. O RPC antigo mantém assinatura e formato de resposta, delega à versão nova usando a última versão como base e retira a metadata da resposta. Assim, os clientes MCP anteriores continuam compatíveis e os novos salvamentos antigos também recebem linhagem e herança no servidor. Versões anteriores à migração sem metadata são apresentadas como origem desconhecida e sem aprovação conhecida.

## Contratos web

- `POST /api/pieces` mantém o contrato anterior e aceita `baseVersion` opcional ao lado de `expectedVersion`. Quando a base é informada, usa o RPC v2; o servidor calcula a aprovação, sem aceitar uma alegação de aprovação enviada pelo cliente.
- `PATCH /api/pieces` recebe `{ operation: 'approve', projectId, pieceId, version, expectedRevision }`. A aprovação incrementa a revisão da metadata; revisão desatualizada retorna HTTP 409 com `currentRevision`.
- `PATCH /api/projects` recebe `{ projectId, title, expectedRevision }`. `rename_project` verifica o proprietário, bloqueia a linha e incrementa `projects.revision`, que começa em 1. Conflito retorna HTTP 409; projeto de outra conta é indistinguível de inexistente.
- A listagem web e os novos salvamentos incluem `version.metadata = { baseVersion, revision, approval: { status, kind, sourceVersion, at } }`. `status` é `unapproved` ou `approved`; `kind` é nulo, `explicit` ou `inherited`. A aprovação explícita aponta para a própria versão. A herdada aponta para a origem do aceite, que pode preceder a base imediata. O ator fica registrado no banco, sem necessidade de expô-lo na interface inicial.
- A listagem de projetos web inclui `project.revision` de forma aditiva. O contrato das ferramentas MCP antigas permanece disponível. A consulta web por RPC recusa mais de mil versões em vez de apresentar uma lista truncada como completa.

Os métodos de escrita verificam a origem do aplicativo, a sessão Supabase e a propriedade por operação. O banco confirma novamente a identidade com `auth.uid()`; respostas usam `no-store`. Falha de transporte depois de uma gravação mantém resultado desconhecido e não dispara repetição automática. Não há conteúdo criativo de conversa nem credencial nesses metadados.

## Verificação e limites

O teste SQL local usa duas identidades sintéticas com `SET ROLE authenticated`, exercita acesso próprio e cruzado, negação de escrita direta, criação baseada em versão antiga, herança e aprovação explícita. Chamadas simultâneas simuladas com a mesma precondição resultam em uma gravação e um conflito. PGlite usa uma conexão; isso não prova corrida entre conexões PostgreSQL independentes. O teste HTTP verifica token, base, precondições, rejeição de aprovação inventada, metadata divergente e resultado incerto. Testes das rotas Next usam um serviço HTTPS sintético com certificado confiado apenas naquele processo.

Antes de aplicar no Supabase, revisar estado real e histórico, aplicar somente esta migração numa transação auditada e validar JWTs reais, permissões e concorrência em conexões independentes. Os scripts antigos de diagnóstico que fixam o corpo de `save_piece_version` precisam reconhecer a versão desta migração; não relaxar suas guardas para repetir uma aplicação desconhecida.
