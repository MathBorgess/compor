# Deploy pela integração Git da Vercel

Roteiro do [ADR 0043](../adr/0043-deploy-vercel-por-integracao-git.md), escrito em 11/11/2026. Os passos usam a conta de Matheus na Vercel e no GitHub. O agente não faz login nem cria credenciais.

## Antes de começar

- Projeto Vercel: `compor-marco0` (`prj_48C8lO4W6WdEMScyAfZRSnkvN6QS`), na equipe `team_2Z6EPeDxnpAcymrhoWq1rxOn`.
- Repositório: `MathBorgess/compor`, privado. O nome anterior, `oficina-em-prancha`, ainda aparece em remotes locais e é redirecionado pelo GitHub.
- O workflow `Supabase migrations` roda em todo push na `main` e publica o check `Apply migrations or initialize baseline`.

## Passos na Vercel e no GitHub

1. **Acesso do app.** No GitHub, em Settings > Applications > Vercel, confirme que o app da Vercel tem acesso a `MathBorgess/compor`.
2. **Conexão.** No projeto `compor-marco0`, abra Settings > Git, escolha Connect Git Repository e selecione `MathBorgess/compor`. Um repositório não pode ficar ligado a projetos de equipes diferentes.
3. **Branch de produção.** Em Settings > Environments > Production > Branch Tracking, mantenha `main`.
4. **Build.** Em Settings > Build and Deployment:
   - Root Directory: `apps/web`;
   - inclusão dos arquivos fora do Root Directory no build ligada, porque `apps/web` instala `../../packages` com `install-links=true`;
   - Node.js Version: `24.x`, a mesma do Quality.

   O comando de instalação vem de `apps/web/vercel.json`.
5. **Aliasing automático.** Em Settings > Environments > Production, mantenha ligada a atribuição automática dos domínios de produção.
6. **Deployment Checks.** Em Settings > Build and Deployment > Deployment Checks, escolha Add Checks, depois GitHub, e selecione `Apply migrations or initialize baseline`. Não renomeie esse job sem atualizar esta configuração.
7. **Variáveis.** Confira as variáveis do ambiente Production. Não copie para Preview as credenciais de produção: Supabase, Vault, chave de assinatura e habilitação da chave padrão. Sem elas, um preview valida o build, mas não acessa dados reais. Mantenha a Deployment Protection dos previews ligada.
8. **Proteção da branch (opcional).** No GitHub, em Settings > Branches, exija `Quality gate` e, se quiser bloquear merges por falha de build na Vercel, também o status de preview da Vercel.

## Conferência depois de conectar

1. Abra ou atualize um PR. O commit deve receber um status da Vercel com o link do preview.
2. Depois do merge, o commit da `main` deve ter um deployment de produção criado pela Vercel e um check `Apply migrations or initialize baseline` concluído com sucesso. Na Vercel, o deployment só deve assumir os domínios depois desse check.
3. Abra a entrada pública e confira se ela responde com a versão nova. Essa conferência não cobre login, geração nem a chave padrão.

Comandos de leitura para o passo 2, sem credenciais da Vercel:

```sh
gh api repos/MathBorgess/compor/commits/main/status --jq '.statuses[] | {context, state, creator: .creator.login}'
gh api repos/MathBorgess/compor/commits/main/check-runs --jq '.check_runs[] | {name, conclusion}'
gh api "repos/MathBorgess/compor/deployments?per_page=5" --jq '.[] | {environment, creator: .creator.login, sha: .sha[0:7]}'
```

## Se algo falhar

- **Build com erro no preview:** leia o log do deployment na Vercel. Diferenças prováveis em relação ao Quality: instalação sem `--ignore-scripts`, variáveis do projeto e versão do Node.
- **Migration falhou ou ficou incerta:** o deployment fica retido. Siga o procedimento de migrations antes de qualquer **Force Promote**.
- **Deployment retido sem check:** confira se o job foi renomeado ou pulado pelo preflight.
