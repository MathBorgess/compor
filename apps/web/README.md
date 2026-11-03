# apps/web

Primeiro corte local do aplicativo web do Compor em Next.js. A pessoa já pode escrever o objetivo na aba, mas o texto não é salvo e a continuação fica indisponível até as integrações existirem.

```sh
npm ci
npm run dev
```

`npm test` verifica o comportamento inicial e a rota MCP por HTTP; `npm run build` verifica o build de produção. O teste de integração da rota usa um serviço HTTPS simulado e requer `openssl`. Nenhuma credencial real é usada.

A rota `/api/mcp` usa `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no servidor. A chave deve ser publicável (`sb_publishable_…`) ou uma chave legada com papel `anon`; chaves secretas/service-role não são aceitas. Sem configuração válida, a rota responde 401 para acesso sem credencial e 503 para acesso autenticado. A migração de projetos e as políticas RLS ainda exigem revisão e teste em Supabase isolado. **Não exponha a rota em produção**: ainda faltam OAuth/discovery, Storage e verificações reais com Supabase, Codex e Agents API.

O corte web não implementa login Google, persistência pela interface, Agents API ou geração de imagem. Não executa nem demonstra a jornada completa.

A landing pública permanece em [`apps/site`](../site/README.md); o protótipo MCP continua separado em `prototypes/compor-mcp`.
