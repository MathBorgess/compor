# Inspeção da auditoria após aplicação interrompida

Na tentativa relatada em 04/11/2026, o guard indicou que `compor_migration_audit` já existia. A evidência do `psql` continha `BEGIN`, configurações e advisory lock, sem demonstrar DDL da tentativa que falhou. Isso não explica a origem do schema nem comprova se houve uma aplicação anterior: não repetir a aplicação até inspecionar o estado.

`supabase/tests/audit_inspect_readonly.sql` lista metadados do schema de auditoria, ACLs, relações e funções Compor selecionadas. O SELECT de linhas da tabela esperada só é habilitado após conferir owner, tipos exatos, RLS, privilégios e ausência de políticas, regras e triggers não internos. Se a estrutura não corresponder, mostra `absent_or_unverified` e não lê dados da tabela. Com a estrutura aprovada, toma um lock temporário `ACCESS SHARE`, repete o guard e conta as linhas; exibe apenas registros com nomes e hashes no formato esperado, usando `ONLY`. O mesmo procedimento de guard e lock permite consultar somente os metadados do bucket `compor-project-images`, após confirmar a estrutura de `storage.buckets`; não lê objetos. Mesmo registros válidos não provam que a aplicação foi bem-sucedida, que SQL ainda é íntegro ou que não há alterações manuais. RLS, grants e comportamento pelo Storage exigem verificações próprias.

Não executar durante mudanças concorrentes em schemas, permissões ou migrações. O lock pode atrasar DDL e tem timeout de cinco segundos; a validação não elimina corridas de namespace/permissões ou efeitos externos em ambientes comprometidos. A captura é privada e não contém senha intencionalmente.

Na raiz da worktree, o operador pode executar este comando para o projeto de teste já identificado; digite a senha somente no prompt do `psql`:

```sh
sh supabase/tests/audit_inspect_capture.sh /tmp/compor-rls-validation-20261103/supabase-ca.crt
```

O wrapper fixa hostname e banco, confere o fingerprint da CA, limpa opções PostgreSQL herdadas e exige TLS `verify-full`. Ele exibe o caminho da captura privada. Em caso de erro, preserve a captura parcial, que não constitui prova de conclusão. O inventário não escreve no banco, não aplica migrações e não usa credenciais da API.
