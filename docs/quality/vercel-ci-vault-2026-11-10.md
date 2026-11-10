# Vercel CI e configuração do Vault — 10/11/2026

O usuário substituiu o deploy por Action pelo setup `npx skills use vercel/ci@setup` e pediu configurar as variáveis da Vercel. O comando foi executado; não houve leitura de chaves reais ou chamadas OpenAI.

## Configuração e produção

`COMPOR_DEFAULT_OPENAI_ENABLED=true` foi gravada no alvo `production` de `compor-marco0` e confirmada por nova leitura da API. `SUPABASE_SERVER_KEY` continua ausente. Essa variável contém uma credencial de servidor do **Supabase**, distinta da chave OpenAI em `COMPOR_CIN_OPENAI`. Não existe conector Supabase nem credencial correspondente nos arquivos de ambiente do projeto ou no processo desta execução; não foi criada uma chave fictícia.

A flag isolada não permite ler o segredo. As variáveis novas também exigem um novo deployment para integrar o ambiente de runtime; não foi feito um rebuild sem a credencial faltante. O fluxo BYOK mantém seu contrato.

A produção atual, criada externamente, é `dpl_G5V72bD3oaMksq1RcccuUfB2sSru`, READY, commit `edcd153f3e4b3220eac6b953ab5f38968800343a`. Os dois aliases públicos apontam para ela. Seus 235 arquivos coincidem com o pacote imutável e contêm o resolver e a rota de status do Vault. A ausência de uso da padrão é configuração de runtime, não falta do código publicado. Não houve login ou geração real nesta verificação.

## Setup de Vercel CI

A skill baixada em `/tmp/skills-use-ITcwnW/setup/SKILL.md` exige: “It must be a private GitHub repository linked to a Vercel project on the team. If not, stop and explain why.” Também exige habilitar CI antes de publicar a branch de setup.

O GitHub confirmou `MathBorgess/compor` privado. O contexto Vercel da equipe `math-ai2` retornou `linkedProjects: []` e nenhuma conexão Git de origem. As ferramentas disponíveis não vinculam esse projeto existente nem habilitam CI; a CLI não dispõe de token. O setup parou antes de editar dependências ou publicar branch. A documentação oficial foi consultada pela busca Vercel; o acesso HTTP direto à página foi recusado pela política de rede.

O job de deploy por Action, substituído pelo pedido atual, foi removido com seus auxiliares exclusivos. Migrations, TLS, latch, bootstrap e seus testes permanecem. O workflow anterior de `ee35c506` confirmou COMMIT e zero migrations pendentes, mas seu job Vercel parou antes do build porque `VERCEL_TOKEN` estava ausente; o token GitHub estava presente.

O Quality permanece nos PRs e manualmente. O push da `main` não o repete. O Quality 60 do corretivo terminou posteriormente aprovado, com 357/357 testes web, estático/site, contratos, performance e gate verdes; não foi uma condição retroativa para o deployment dispensado pelo usuário.

Evidências locais: `/workspace/scratch/compor-vercel-ci-setup-readiness.json`, `compor-vault-external-production-G5V72.json` e `compor-vault-progress.json`.
