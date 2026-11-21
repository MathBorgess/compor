# ADR 0078 — Origem de Preview na Vercel

Em 21/11/2026, o preview do Compor recusou iniciar login porque `APP_ORIGIN` era compartilhada entre Preview e Production. Cada deployment de Preview passa a usar a sua URL imutável para iniciar o OAuth e receber o callback com o mesmo cookie PKCE.

Com `VERCEL_ENV=preview`, o servidor exige `VERCEL=1`, o ID do projeto `math-ai2/compor` e um hostname gerado para um deployment do projeto em `VERCEL_URL`. O adaptador Pages e a configuração de Auth usam o mesmo resolvedor. O cabeçalho `Origin` continua sujeito à comparação exata. Aliases de branch, domínios de terceiros e cabeçalhos `Host` e `X-Forwarded-Host` ficam fora da seleção de origem. Produção e desenvolvimento continuam usando o `APP_ORIGIN` explícito, com HTTP restrito ao loopback. [Variáveis de sistema da Vercel](https://vercel.com/docs/environment-variables/system-environment-variables)

O preview conserva a proteção da Vercel. O OAuth é iniciado e concluído pelo navegador no mesmo hostname protegido. Para teste completo, use um backend Supabase isolado e o callback exato daquele deployment. Quando uma configuração temporária de callback for aprovada, retire a entrada ao terminar o teste. Os testes locais verificam o 303 com backend sintético e sem seguir o redirect. [Redirect URLs do Supabase](https://supabase.com/docs/guides/auth/redirect-urls)
