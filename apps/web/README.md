# apps/web

Primeiro corte local do aplicativo web do Compor em Next.js. A pessoa pode escrever o objetivo; o rascunho permanece nesta aba quando o armazenamento de sessão está disponível, mas não é salvo no projeto. A continuação fica indisponível até as integrações existirem.

```sh
npm ci
npm run dev
```

O login Google usa Supabase Auth com PKCE. Configure `SUPABASE_URL` (origem HTTPS do projeto), `SUPABASE_ANON_KEY` (somente chave pública anon/publishable) e `APP_ORIGIN` (origem fixa do app; HTTPS, ou HTTP apenas em localhost) no ambiente do servidor. Cadastre exatamente `${APP_ORIGIN}/auth/callback` nas URLs de redirecionamento do Supabase e configure o provedor Google no projeto. Não use chave administrativa. Sem configuração, o login fica indisponível. O aplicativo não confia em parâmetros para decidir o destino após o callback; usa apenas `/`.

`npm test` verifica o comportamento inicial e fronteiras HTTP sem serviços externos; `npm run build` verifica o build de produção. O fluxo OAuth/Google, cookies e recuperação de sessão não foram provados com serviços reais. Este corte não implementa persistência dos projetos, Agents API, MCP remoto ou geração de imagem e não demonstra a jornada completa.

A landing pública permanece em [`apps/site`](../site/README.md); o protótipo MCP continua separado em `prototypes/compor-mcp`.
