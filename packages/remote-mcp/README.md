# MCP remoto — fronteira inicial

Este pacote fornece um handler HTTP stateless para integrar a uma rota Node.js do backend. A credencial `Bearer` é verificada em cada requisição pelo Supabase Auth configurado pelo servidor; sem autenticador, a fronteira falha fechada. A ferramenta `prepare_brief` organiza dados fornecidos sem persistir nem confirmar fatos ou preferências. Quando configurado explicitamente um `projectStore`, as ferramentas `create_project` e `list_projects` criam e listam projetos privados.

`createSupabaseAuthenticator` recebe URL HTTPS do projeto e chave pública (anon/publishable), nunca chave administrativa. `createRemoteMcpHandler` recebe o autenticador e devolve função `(Request) => Promise<Response>`. Um provedor de identidade indisponível retorna 503, sem ecoar credenciais; requisições são limitadas a 64 KiB e não são armazenadas em cache. Testes usam o transporte HTTP do SDK MCP e simulam somente o limite externo do serviço de identidade.

`createSupabaseProjectStore` recebe URL HTTPS e chave pública, e acessa PostgREST com o token do usuário verificado. A migração `supabase/migrations/20261103000000_projects.sql` define acesso mínimo e políticas RLS para projetos. Os testes de projeto simulam PostgREST e suas políticas; portanto **não comprovam RLS** nem foram executados contra um banco real. Aplique a migração somente após revisão e teste de isolamento em ambiente Supabase isolado.

```sh
npm ci
npm test
```

Este pacote ainda **não** fornece OAuth/discovery ou emissão de tokens para Codex/Agents API, rotas Next.js, acesso a peças, Supabase Storage, observabilidade ou geração de imagem. Nenhuma integração com Supabase real, Vercel, Codex Desktop ou Agents API foi testada. Não expor o endpoint até essas fronteiras serem implementadas e verificadas. O token MCP é distinto da chave OpenAI BYOK.
