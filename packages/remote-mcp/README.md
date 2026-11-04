# MCP remoto — fronteira inicial

Este pacote fornece um handler HTTP stateless para integrar a uma rota Node.js do backend. A credencial `Bearer` é verificada em cada requisição pelo Supabase Auth configurado pelo servidor; sem autenticador, a fronteira falha fechada. A ferramenta `prepare_brief` organiza dados fornecidos sem persistir nem confirmar fatos ou preferências. Quando configurado explicitamente um `projectStore`, as ferramentas `create_project` e `list_projects` criam e listam projetos privados.

`createSupabaseAuthenticator` recebe URL HTTPS do projeto e chave pública (anon/publishable), nunca chave administrativa. `createRemoteMcpHandler` recebe o autenticador e devolve função `(Request) => Promise<Response>`. Um provedor de identidade indisponível retorna 503, sem ecoar credenciais; requisições são limitadas a 64 KiB e não são armazenadas em cache. Testes usam o transporte HTTP do SDK MCP e simulam serviços externos de identidade e dados.

`createSupabaseProjectStore` recebe URL HTTPS e chave pública, e acessa PostgREST com o token do usuário verificado. A migração `supabase/migrations/20261103000000_projects.sql` define acesso mínimo e políticas RLS para projetos. Os testes de projeto simulam PostgREST e suas políticas; portanto **não comprovam RLS** nem foram executados contra um banco real. Aplique a migração somente após revisão e teste de isolamento em ambiente Supabase isolado.

`createSupabasePieceStore` disponibiliza versões de peça com texto, preço, data e legenda com origem. `save_piece_version` recebe um projeto, um identificador de peça, a versão esperada (zero para criar) e o conteúdo integral: devolve `saved`, `conflict` com a versão atual ou `not_found` para projeto inexistente ou alheio. `list_piece_versions` consulta o histórico. A migração `20261103000001_piece_versions.sql` define versões imutáveis e RLS; sua função de gravação verifica propriedade e usa bloqueio do projeto para serializar operações. Usuários autenticados não têm permissão de inserir diretamente na tabela. Em falha de comunicação após o envio, consulte o histórico antes de tentar novamente: o resultado da gravação pode ser desconhecido. Matheus [relatou](../../docs/spikes/2026-11-03-supabase-rls-validacao.md) execução transacional em Supabase isolado com rollback; o agente não capturou a saída completa. Os testes simulados não comprovam isolamento em produção nem concorrência entre conexões PostgreSQL.

```sh
npm ci
npm test
```

O aplicativo Next.js já inclui a rota `/api/mcp`, os adaptadores de projetos e peças e um corte experimental de OAuth/discovery desativado por padrão; veja [apps/web](../../apps/web/README.md). O pacote não implementa Storage, observabilidade operacional ou geração de imagem. A prova sintética separada da OpenAI não conectou o Compor; OAuth, Codex Desktop, Supabase e Vercel não tiveram a jornada integrada verificada. Não expor o endpoint até as fronteiras pendentes serem verificadas. O token MCP é distinto da chave OpenAI BYOK.
