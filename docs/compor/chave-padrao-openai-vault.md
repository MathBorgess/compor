# Preparar a IA do Compor com Supabase Vault

O [ADR 0038](../adr/0038-chave-padrao-openai-no-vault.md) registra a chave padrão quando não houver própria. Matheus informou ter criado `COMPOR_CIN_OPENAI` no Vault; o valor não foi lido ou verificado remotamente nesta preparação, que não habilita produção.

| Item | Uso |
| --- | --- |
| Vault: `COMPOR_CIN_OPENAI` | Nome fixo do segredo com a chave OpenAI da aplicação |
| `SUPABASE_SERVER_KEY` | Chave secreta/service-role do mesmo Supabase, só no servidor |
| `COMPOR_DEFAULT_OPENAI_ENABLED` | Apenas `true` habilita a integração |
| `SUPABASE_URL` e chave publicável existentes | Projeto e acesso normal como a pessoa autenticada |

`COMPOR_CIN_OPENAI` contém a chave OpenAI. É distinto de `SUPABASE_SERVER_KEY`, que permite ao servidor consultar a RPC, e do secret `SUPABASE_DB_PASSWORD` usado pelo workflow de migrations. Esses valores não vão ao navegador.

Não use `NEXT_PUBLIC_` para chave do servidor/OpenAI. Valores secretos não entram em migrations, exemplos, argumentos de terminal, commits, mensagens ou arquivos versionados. Cadastre pelo painel protegido do Vault e configure variáveis sensíveis pelo mecanismo protegido do ambiente.

## Ativação

1. Revisar e integrar a migration de leitura restrita pelo fluxo normal do projeto verificado. Confirmar workflow e commit antes de usar o código dependente.
2. Confirmar no mesmo projeto a entrada já informada `COMPOR_CIN_OPENAI`, com o valor da chave OpenAI. A aplicação não cria, lista ou altera segredos.
3. Configurar `SUPABASE_SERVER_KEY` no servidor. Seu uso é exclusivo da RPC fixa; dados continuam com a identidade da pessoa.
4. Habilitar `COMPOR_DEFAULT_OPENAI_ENABLED=true` no ambiente escolhido e publicar conforme os gates existentes, sem mover domínios antes da validação exigida.
5. Em sessão autenticada, confirmar disponibilidade sem segredo exposto nem requisição OpenAI. Criar/enviar ideia ou a ação explícita de início autoriza uso.
6. Validar própria, ausência dela, padrão indisponível, troca e pendências. Chamadas reais e custo dependem da autorização operacional aplicável; testes automáticos são simulados.

Validar a forma da chave não comprova saldo, projeto ou modelos habilitados. A credencial do servidor deve pertencer ao Supabase de `SUPABASE_URL`. Falhas aparecem como indisponibilidade, sem conteúdo de respostas do Vault no navegador.

## Rotação e desativação

Desabilitar a flag impede novas ações com a padrão e mantém BYOK independente. Não cancela chamada já enviada: preserve recibos e resultados incertos.

Planeje resolver pendências antes de atualizar o valor pelo Vault, sem mudar o nome nem gravar o segredo no repositório. As novas provas são vinculadas à credencial original: uma nova chave do mesmo projeto OpenAI também não pode reutilizá-las. A recuperação pode ficar indisponível depois da troca; isso não autoriza repetir geração. Recibos e resultados incertos permanecem preservados, e reconciliação local sem fornecedor mantém suas verificações próprias.

Após confirmar configuração, reative e faça a validação autorizada. Falha de BYOK não usa a padrão como alternativa. O código não cria chave nem troca projeto OpenAI silenciosamente.

## Limites

A padrão não é identidade e não concede acesso a projetos alheios. Papéis comuns não executam a RPC. A chave administrativa não vai a clientes, testes de navegador ou ferramentas do modelo.

Lotes e pausas não são orçamento. Cadastro, limites do projeto OpenAI, habilitação remota e testes com duas contas reais são etapas operacionais separadas. A execução atual não altera essas configurações.
