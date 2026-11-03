# MCP remoto — fronteira inicial

Este pacote fornece um handler HTTP stateless para integrar a uma rota Node.js do backend. A credencial `Bearer` é verificada em cada requisição pelo Supabase Auth configurado pelo servidor; sem autenticador, a fronteira falha fechada. Apenas a ferramenta `prepare_brief` está exposta: organiza dados fornecidos sem persistir nem confirmar fatos ou preferências.

`createSupabaseAuthenticator` recebe URL HTTPS do projeto e chave pública (anon/publishable), nunca chave administrativa. `createRemoteMcpHandler` recebe o autenticador e devolve função `(Request) => Promise<Response>`. Um provedor de identidade indisponível retorna 503, sem ecoar credenciais; requisições são limitadas a 64 KiB e não são armazenadas em cache. Testes usam o transporte HTTP do SDK MCP e simulam somente o limite externo do serviço de identidade.

```sh
npm ci
npm test
```

Este pacote ainda **não** fornece OAuth/discovery ou emissão de tokens para Codex/Agents API, rotas Next.js, acesso a projetos ou peças, Supabase Postgres/Storage, RLS, autorização por objeto, observabilidade ou geração de imagem. Nenhuma integração com Supabase real, Vercel, Codex Desktop ou Agents API foi testada. Não expor o endpoint até essas fronteiras serem implementadas e verificadas. O token MCP é distinto da chave OpenAI BYOK.
