# ADR 0043 — Deploy pela integração Git da Vercel, com Deployment Checks

- Estado: accepted; integração Git observada, mas retenção por Deployment Check inoperante na verificação de 15/11/2026
- Data: 11/11/2026
- Fonte: pedido de Matheus nesta data, na sessão do Claude Code: gerar deployments e atualizar o site a cada merge na `main`. Depois de saber que a Vercel CI só roda checks, ele escolheu “Git + Deployment Checks, não inclua Vercel CI”.

## Contexto

O [ADR 0039](0039-publicacao-vercel-apos-migrations.md) removeu o deploy por GitHub Action e apontou `npx skills use vercel/ci@setup` como substituto. A skill e a [documentação da Vercel CI](https://vercel.com/docs/ci) mostram que a Vercel CI:

- só executa tarefas Turborepo marcadas com `"tags": ["ci"]` e publica o status no GitHub;
- não cria deployments;
- está em beta;
- exige o repositório conectado a um projeto Vercel.

Na conferência de 11/11, antes deste PR, o último commit da `main` (`4e027f7`) não tinha status nem check-run da Vercel. Os deployments `production` do GitHub vinham do ambiente do workflow de migrations.

Depois da abertura do PR 49, o commit `f31c286` recebeu o status `Vercel` com sucesso às 10:16 UTC, apontando um preview do projeto `compor-marco0`. A integração Git estava, portanto, ativa para PRs nesse momento. A data da conexão não foi observada, e a branch de produção, o Deployment Check, a versão de Node e as variáveis por ambiente não podem ser conferidos pelo GitHub.

## Decisão

- **Deploy:** o projeto `compor-marco0` se conecta a `MathBorgess/compor` pela integração Git da Vercel, com a `main` como branch de produção. Cada push na `main` cria um deployment de produção, e cada PR recebe um preview.
- **Ordem com as migrations:** em Deployment Checks, o deployment de produção exige o check `Apply migrations or initialize baseline`, do workflow `Supabase migrations`. O deployment é criado e construído, mas só recebe os domínios de produção depois que esse check passa.
- **Execução antiga:** o job já falha quando a `main` mudou depois do evento. Assim, um deployment mais antigo fica retido, e a execução enfileirada do commit novo decide a promoção.
- **Build:** o projeto mantém `rootDirectory: apps/web` e o `installCommand` de `apps/web/vercel.json`. As dependências locais em `../../packages` exigem incluir no build os arquivos fora do Root Directory. A versão do Node deve ser 24.x, a mesma do Quality.
- **Vercel CI:** não é adotada. O repositório não usa workspaces, instala cada pacote com `npm ci --prefix`, e a suíte precisa de Chromium, `psql` e `cwebp`. As tarefas repetiriam o Quality do GitHub e dependeriam de reestruturação. Quality continua sendo o gate dos PRs.

Esta decisão substitui a seção “Substituição posterior em 10/11/2026” do ADR 0039 no ponto em que apontava a Vercel CI como caminho de publicação. Os jobs e contratos de migrations não mudam. `scripts/stage_vercel_web.py` deixa de ser necessário para publicar, porque a Vercel constrói o checkout, mas fica preservado até uma remoção explícita.

## Pontos de qualidade mapeados

- **Nome do check:** o Deployment Checks identifica o check pelo nome do job. `scripts/tests/test_migration_workflow.py` passa a exigir os nomes `Confirm migration automation is enabled` e `Apply migrations or initialize baseline`, além do gatilho `push` na `main`. Renomear o job sem atualizar a Vercel reteria a produção sem erro visível. O teste roda no job de contratos.
- **Preview:** o deployment de cada PR passa a validar o build no ambiente da Vercel, com instalação sem `--ignore-scripts`, variáveis reais do projeto e Node da Vercel. Esse status é externo ao Quality gate. Para bloquear merge, a proteção da branch precisa exigi-lo, uma configuração do GitHub que cabe a Matheus.

Não foi adicionado smoke automático do deployment. A Vercel permite que um workflow acionado por `repository_dispatch` reporte status ao Deployment Checks. Isso exigiria um segredo de bypass para previews protegidos e minutos adicionais, e fica como proposta separada.

## Verificação posterior em 15/11/2026

O projeto lista `Apply migrations or initialize baseline` como check GitHub de Production, marcado Blocking. Contudo, `Auto-Assign Custom Production Domains` está desligado. O [deployment de produção `FFEtnh1`](https://vercel.com/math-ai2/compor-marco0/FFEtnh1ap1i89jtWHe4CysvxK8UV), criado por redeploy da branch do PR 50 no SHA `5b6783a`, mostra `No checks configured` e `Assigning Custom Domains: Skipped`; os aliases oficiais foram atribuídos em seguida. A [documentação de Deployment Checks da Vercel](https://vercel.com/docs/deployment-checks#adding-github-checks) exige a atribuição automática ligada como pré-requisito para checks do GitHub. Assim, a retenção pretendida nesta decisão não estava ativa neste deployment e não pode ser presumida para o próximo. A migration 00029 ainda não pertence à `main` nesta verificação.

Não há alteração no repositório capaz de ativar esse setting. Reabilitá-lo exige verificar o efeito sobre deployments já preparados e observar um novo deployment legítimo de `main` com o check presente antes da atribuição dos domínios. Uma promoção manual depois da migration seria outro fluxo, não a retenção automática definida aqui.

## Limites

- Banco e Vercel continuam sem transação comum. Se a migration falhar ou ficar incerta, o deployment fica retido, mas a versão anterior continua no ar.
- A documentação não diz como a Vercel trata um check pulado ou ausente. Se o preflight desabilitar o `migrate`, conferir o deployment antes de usar **Force Promote**.
- A execução manual `bootstrap` não cria deployment.
- A configuração do projeto e da proteção da branch vive na Vercel e no GitHub, não no repositório. Este ADR não comprova que ela foi feita. O [roteiro](../compor/deploy-vercel-git.md) lista os passos e a conferência posterior.
- Publicar não habilita a chave padrão do Vault nem comprova login, geração ou isolamento entre contas reais.
