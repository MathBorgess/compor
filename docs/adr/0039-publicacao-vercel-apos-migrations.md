# ADR 0039 — Publicação Vercel após as migrations

- Estado: accepted.
- Data: 10/11/2026.
- Fonte: Matheus pediu que o workflow do Supabase criasse e ativasse o deployment Vercel após a migration. Também retirou o Quality do push na `main` e dispensou aguardar seu resultado remoto para esta publicação.

## Decisão

O workflow `Supabase migrations` passa a coordenar o banco e a aplicação. Após sucesso confirmado da operação `migrate`, incluindo a liberação da trava durável, um job dependente prepara as fontes do mesmo commit imutável, cria um deployment de produção sem atribuir os domínios antecipadamente, aguarda o build, verifica a entrada pública e ativa esse mesmo deployment. A operação manual `bootstrap` não publica a aplicação.

O empacotamento usa `scripts/stage_vercel_web.py`, preservando `apps/web/` e o grafo local em `vendor`; o projeto Vercel mantém `rootDirectory: apps/web`. O alvo é o projeto `compor-marco0` (`prj_48C8lO4W6WdEMScyAfZRSnkvN6QS`) da equipe `team_2Z6EPeDxnpAcymrhoWq1rxOn`. A CLI tem versão exata no workflow. O job usa o secret `VERCEL_TOKEN` do ambiente GitHub `production`, sem extrair a autorização do conector nem copiar valores para o repositório.

Falha de migration, resultado incerto, bootstrap, credencial ausente, build reprovado, smoke reprovado ou commit já superado impedem a ativação. A fila do workflow abrange migrations e publicação; não cancela uma aplicação em curso. As guardas de SHA reduzem o risco de publicar uma versão antiga, mas não tornam o avanço da `main` e a promoção uma transação distribuída.

A instrução atual autoriza a ativação e a atualização dos aliases de produção nesse fluxo. Substitui a espera manual anterior antes de promover; os quatro testes reais continuam sendo validação humana posterior. O agente não faz login nem chamadas pagas para preencher essa evidência. Configuração da chave padrão do Vault é uma operação distinta: publicar código não cria `SUPABASE_SERVER_KEY` nem habilita `COMPOR_DEFAULT_OPENAI_ENABLED`.

## Limites

Esta decisão substitui somente a independência entre deploy e migrations descrita nos ADRs [0027](0027-trava-automacao-migrations.md) e [0028](0028-migracoes-atomicas-em-lote.md). Preserva TLS, reconciliação, transação SQL, confirmação de `COMMIT`, trava durável e bootstrap separado.

Banco e Vercel não compartilham uma transação. Se o banco confirmar e a publicação falhar, o banco permanece atualizado e a versão anterior da aplicação pode continuar ativa. Migrations precisam preservar essa compatibilidade; não há rollback automático do banco. Falha ou resposta incerta da promoção exige consultar o deployment e seus aliases antes de repetir. Credenciais e proteções efetivamente configuradas no GitHub e na Vercel determinam se a execução remota pode concluir.

O smoke usa somente a entrada pública, sem sessão, modelo ou geração; não comprova login, isolamento entre contas reais ou qualidade criativa. Quality continua nos PRs e manualmente, sem ser repetido pelo push da `main`.
