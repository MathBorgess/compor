# apps/web

Primeiro corte local do aplicativo web do Compor em Next.js. A pessoa já pode escrever o objetivo na aba, mas o texto não é salvo e a continuação fica indisponível até as integrações existirem.

```sh
npm ci
npm run dev
```

`npm test` verifica o comportamento inicial pelo HTTP; `npm run build` verifica o build de produção. Este corte não implementa login Google, armazenamento, Agents API, MCP remoto ou geração de imagem e não usa credenciais. Não executa nem demonstra a jornada completa.

A landing pública permanece em [`apps/site`](../site/README.md); o protótipo MCP continua separado em `prototypes/compor-mcp`.
