# Aplicação transacional no projeto de teste Compor

Este método é exclusivo para `compor-marco0-test` (`db.dpboawdnuxuzjoufpiry.supabase.co`). O inventário de 04/11/2026 não encontrou relações públicas Compor nem a relação `supabase_migrations.schema_migrations`; não demonstra ausência de alterações manuais ou de efeitos externos. Não operar outro projeto com este roteiro.

O gerador lê do Git as onze migrações revisadas e exige os hashes fixos no próprio script. Ele cria `apply.sql` em diretório privado, com uma única transação, `ON_ERROR_STOP`, lock de cinco segundos, verificação de estado inicial e auditoria SQL não exposta no schema `compor_migration_audit`. As onze migrações e os registros de hash/commit entram no mesmo `COMMIT`; uma falha SQL antes dele deixa a conexão abortada, e o encerramento do `psql` reverte as alterações transacionais. Isso não garante reversão de efeitos externos arbitrários que algum trigger ou extensão possa causar.

`postgres` é `BYPASSRLS` e não é proprietário do Storage. O Supabase documenta que o papel pode criar políticas em tabelas gerenciadas via sua delegação especial; a permissão exata e o INSERT do bucket ainda serão verificados pela execução, não presumidos. Não mudar o owner nem conceder papéis administrativos. Fontes: [Storage e políticas](https://supabase.com/kb/troubleshooting/revoking-privileges-on-storage-pg_cron-vault-and-extension-objects-has-no-effect-916576), [criação de buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets).

**Auditoria:** `compor_migration_audit.applied` é um registro específico deste procedimento; ele **não é** `supabase_migrations.schema_migrations` e não representa execução de `supabase db push`. Antes de adotar a CLI Supabase posteriormente, revisar o estado e reconciliar seu histórico conscientemente; não executar `db push` cegamente.

## Preparar, revisar e aplicar

Na raiz desta worktree, escolha o SHA completo do commit aprovado, sem DDL concorrente no projeto:

```sh
python3 scripts/prepare_compor_migrations.py SHA_COMPLETO
```

O resultado informa o caminho privado do arquivo e seu SHA-256. Revise o arquivo e o hash antes de executar. O wrapper confere novamente o arquivo contra os blobs do commit e seus hashes, confere a CA, fixa hostname, banco e usuário do projeto de teste, limpa variáveis PostgreSQL herdadas, exige TLS `verify-full` e solicita a senha pelo prompt do `psql`:

```sh
sh scripts/apply_compor_migrations_test_project.sh SHA_COMPLETO /caminho/privado/apply.sql /tmp/compor-rls-validation-20261103/supabase-ca.crt
```

Não incluir senha em argumentos ou arquivos. O comando mostra um caminho privado com a saída do `psql`. Um exit code zero isolado não substitui verificar `COMMIT`, as onze entradas de auditoria e o estado efetivo. Falha, perda de conexão ou ausência de confirmação deixam o resultado potencialmente incerto: preserve o arquivo, consulte o schema de auditoria e o estado do banco por uma conexão nova antes de qualquer repetição. A preparação não liga flags nem executa API de imagem.

Os testes locais exercitam commit, recusa de repetição, falha no meio da transação e rollback em PGlite, além de destino/TLS com `psql` simulado. Eles não reproduzem as triggers, delegação de privilégio, Storage API ou infraestrutura do Supabase. Após aplicação real, validar isolamento com duas identidades, Storage pela API e concorrência em conexões separadas, antes de habilitar recursos e realizar chamadas pagas.
