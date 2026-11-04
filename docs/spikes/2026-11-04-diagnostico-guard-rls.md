# Diagnóstico da guarda do ensaio RLS

O ensaio de duas identidades abortou antes dos inserts, com `unexpected table, RLS, trigger, rule, descendant or generated column`. A captura mostrou `BEGIN`, os `SET` e `LOCK TABLE`, mas nenhuma inserção ou conclusão. Isso não identifica qual condição falhou e não demonstra resultado de RLS. Não repetir o ensaio nem afrouxar a guarda antes de entender o catálogo.

`rls_guard_diagnose_readonly.sql` consulta apenas metadados dos quatro alvos, numa transação `READ ONLY` que termina em `ROLLBACK`. Mostra espécie e RLS das tabelas, nomes e funções de triggers não internos, regras, descendentes e colunas geradas. Não lê linhas de usuários, projetos ou Storage, e não executa os triggers. Os nomes internos podem ser sensíveis e a captura deve permanecer privada. A inspeção identifica condições presentes, não prova que uma função de trigger é inofensiva ou que não houve alterações concorrentes.

No projeto de teste previamente identificado, execute o wrapper a partir da raiz da worktree e digite a senha apenas no prompt do `psql`:

```sh
sh supabase/tests/rls_guard_diagnose_capture.sh /tmp/compor-rls-validation-20261103/supabase-ca.crt
```

O wrapper fixa host, porta, banco, usuário e fingerprint da CA, exige TLS `verify-full`, desliga GSS e remove PG* herdadas. Informe apenas o caminho privado retornado ou a mensagem de erro, sem enviar senha. Se o comando falhar, a saída parcial não comprova conclusão. Não modificar dados, flags, triggers ou políticas como parte deste diagnóstico.
