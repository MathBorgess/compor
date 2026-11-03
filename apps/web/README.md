# apps/web

Primeiro corte local do aplicativo web do Compor em Next.js. A pessoa pode escrever o objetivo; o rascunho permanece nesta aba quando o armazenamento de sessão está disponível, mas não é salvo no projeto. A continuação fica indisponível até as integrações existirem.

O rascunho autenticado é vinculado à conta e não é carregado enquanto a sessão é verificada ou está indisponível. Um rascunho iniciado antes do primeiro login pode acompanhar esse login; depois de uma conta ter entrado, texto digitado sem autenticação fica somente em memória. Rascunhos anteriores sem identidade não são atribuídos automaticamente a uma conta. O armazenamento da aba não é uma cópia persistente no Supabase.

```sh
npm ci
npm run dev
```

O login Google usa Supabase Auth com PKCE. Configure `SUPABASE_URL` (origem HTTPS do projeto), `SUPABASE_PUBLISHABLE_KEY` (somente chave pública anon/publishable) e `APP_ORIGIN` (origem fixa do app; HTTPS, ou HTTP apenas em localhost) no ambiente do servidor. Cadastre exatamente `${APP_ORIGIN}/auth/callback` nas URLs de redirecionamento do Supabase e configure o provedor Google no projeto. Não use chave administrativa. Sem configuração, o login fica indisponível. O aplicativo não confia em parâmetros para decidir o destino após o callback; usa apenas `/`.

A rota `/api/mcp` usa `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no servidor. A chave deve ser publicável (`sb_publishable_…`) ou uma chave legada com papel `anon`; chaves secretas/service-role não são aceitas. Sem configuração válida, a rota responde 401 para acesso sem credencial e 503 para acesso autenticado. A migração de projetos e as políticas RLS ainda exigem revisão e teste em Supabase isolado. **Não exponha a rota em produção**: ainda faltam OAuth/discovery, Storage e verificações reais com Supabase, Codex e Agents API.

`npm test` verifica o comportamento inicial e fronteiras HTTP sem serviços externos; o teste da rota MCP usa HTTPS simulado e requer `openssl`. `npm run build` verifica o build de produção. O fluxo OAuth/Google, cookies e recuperação de sessão não foram provados com serviços reais. Este corte não implementa persistência dos projetos pela interface ou geração de imagem e não demonstra a jornada completa.

O teste de isolamento do rascunho executa em Chrome local; defina `BROWSER_EXECUTABLE_PATH` para outro executável Chromium compatível. Sem navegador disponível, esse teste é marcado como ignorado e o isolamento fica sem essa verificação.

A landing pública permanece em [`apps/site`](../site/README.md); o protótipo MCP continua separado em `prototypes/compor-mcp`.
