# Site público do Compor

Landing estática em pt-BR para `https://compor.mathai.com.br`. Astro gera HTML, CSS e JS na build. O Cloudflare Workers serve essa pasta como [static assets](https://developers.cloudflare.com/workers/static-assets/), sem Worker script e sem o adapter SSR. O guia usado é o de [Astro estático na Cloudflare](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/).

O aplicativo Demo em Next.js, previsto para a Vercel, fica reservado em [`apps/web`](../web/README.md). Este site não altera `prototypes/compor-mcp`.

## Comandos

Na pasta `apps/site`, com Node.js 22.12 ou mais novo:

```sh
npm ci
npm run dev
```

`npm run dev` sobe o Astro em `http://127.0.0.1:4321`.

```sh
npm run build
```

A saída é `apps/site/dist` (`./dist` a partir desta pasta). O `wrangler.jsonc` aponta `assets.directory` para essa pasta. A build também grava `dist/_headers` e confere o texto da página.

```sh
npm run preview
```

Serve a build pelo Astro.

```sh
npm run build
npm run cf-dev
```

`wrangler dev` entrega `dist` como o Workers vai entregar, inclusive a página 404. Rode a build antes: o Wrangler não compila o Astro.

Publicar, só depois do ok de quem mantém o domínio:

```sh
npm run deploy
```

Isso executa `astro build` e `wrangler deploy`. A zona `mathai.com.br` precisa estar na mesma conta Cloudflare. O `wrangler.jsonc` registra o custom domain `compor.mathai.com.br` e deixa `workers_dev` desligado. A data de compatibilidade é `2026-10-31`. Logs e traces ficam ligados em `observability`.

No Workers Builds, o diretório raiz do projeto é `apps/site`. Build: `npm ci && npm run build`. Deploy: `npx wrangler deploy`.

## Rotas

| Caminho | Arquivo |
| --- | --- |
| `/` | `src/pages/index.astro` |
| 404 | `src/pages/404.astro` |

Páginas estáticas futuras, inclusive rotas de SEO, entram em `src/pages/` e passam a constar no sitemap gerado em `dist/sitemap-index.xml`. O layout já inclui meta, Open Graph e o ponto de JSON-LD. `public/robots.txt` aponta para o sitemap.

## Lista e CTA

O texto do botão é "Criar meu post". O destino está numa constante só, `CTA_DESTINATION` em `src/data/site.ts`:

- `"waitlist"` desce até `#lista` (valor atual).
- `"contact"` abre `WAITLIST_SUBMIT_TARGET`.

TODO(owner): a escolha entre lista e contato direto ainda está pendente.

TODO(waitlist): não há backend. O alvo padrão é `mailto:ola@mathai.com.br`, que precisa ser confirmado antes de publicar. Para trocar sem editar código, defina `PUBLIC_WAITLIST_SUBMIT_TARGET` (veja `.env.example`). Um `mailto:` abre o programa de e-mail com nome, e-mail e o que a pessoa vende. Outro valor vira o `action` do formulário. Se o endpoint for de outra origem, inclua essa origem em `form-action` dentro de `scripts/write-headers.mjs`.

A página diz que nada é gravado nela.

## Analytics

TODO(analytics): a escolha entre PostHog e Vercel Analytics está pendente. Não há SDK nem chave. O placeholder está em `src/scripts/analytics.ts` e num comentário do layout. Os eventos já são chamados na página e ficam só na memória do navegador:

- `landing_viewed`
- `cta_clicked` com `position` `header`, `hero` ou `final`
- `waitlist_submitted`

Não enviar nome, e-mail ou oferta quando a ferramenta for ligada.
