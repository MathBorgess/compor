# Reserva de imagem — plano de teste com conexões independentes

**Estado em 3 de novembro de 2026:** não foi executado um teste com duas conexões PostgreSQL independentes. Nesta máquina foram encontrados `initdb` e `pg_ctl` do pacote libpq, mas não `postgres` ou `postmaster` no PATH nem nos diretórios consultados de Homebrew, `/Applications` e diretórios locais. O daemon Docker ativo pertence ao contexto `colima`, cujo uso foi excluído desta investigação. PGlite foi usado em outros testes, mas sua instância de conexão única não comprova esta disputa. Nenhum serviço foi iniciado ou interrompido e nenhum banco remoto foi acessado.

O procedimento abaixo é uma **proposta não executada** para a migração `20261103000004_image_tool_reservations.sql` da branch integrada no commit `43be50c`. Não é prova de desempenho, isolamento Supabase, consentimento ou E2E. Uma execução futura requer servidor PostgreSQL local instalado, um cluster novo e descartável exclusivo para o teste, acesso por socket Unix e banco vazio chamado `compor_reserva_descartavel`. Não use Colima, banco remoto ou banco existente. A preparação comita dados sintéticos nesse banco descartável; não a execute em outro alvo. Inspecione as migrações e scripts antes de usar.

## Preparação

O operador deve criar e iniciar **manualmente** o cluster descartável com binários PostgreSQL instalados, registrar seu próprio diretório de dados, socket Unix, porta e PID, e criar o banco vazio. Use duas sessões `psql` A e B e uma sessão observadora C, todas no mesmo banco, conectadas pelo caminho absoluto do socket Unix e sem compartilhar conexão. Verifique em cada sessão `SELECT current_database(), inet_server_addr(), pg_backend_pid();`: banco deve ser `compor_reserva_descartavel`, endereço do servidor deve ser `NULL` (socket Unix) e PIDs devem ser distintos. Se não for assim, pare. As sessões de preparação e observação precisam de privilégios administrativos somente nesse cluster descartável; não insira senhas em código ou chat.

No banco vazio, a partir da raiz do repositório e de uma sessão `psql` com `\set ON_ERROR_STOP on`, crie o fixture abaixo. O `COMMIT` é necessário para as demais conexões verem os dados: por isso o requisito de cluster isolado não pode ser relaxado.

```sql
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'compor_reserva_descartavel' OR inet_server_addr() IS NOT NULL THEN RAISE EXCEPTION 'destino inválido'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) OR to_regnamespace('auth') IS NOT NULL THEN RAISE EXCEPTION 'banco não está vazio'; END IF;
END $$;
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO public;
GRANT EXECUTE ON FUNCTION auth.uid() TO public;
\i supabase/migrations/20261103000000_projects.sql
\i supabase/migrations/20261103000001_piece_versions.sql
\i supabase/migrations/20261103000002_agent_attempts.sql
\i supabase/migrations/20261103000004_image_tool_reservations.sql
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO public.projects(id, owner_id, title) VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','sintético');
INSERT INTO public.piece_versions(project_id,piece_id,version,content) VALUES ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',1,'{}');
INSERT INTO public.agent_attempts(id,owner_id,project_id,idempotency_key) VALUES
 ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
COMMIT;
```

Antes de cada chamada nas sessões A e B, faça `SET ROLE authenticated;` e `SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);`. Marque as sessões com `SET application_name='compor_race_a';` e `SET application_name='compor_race_b';`. A observadora C deve usar o papel administrativo local, sem alterar dados.

## Ordem 1: finalização antes da reserva

1. Em A, execute `BEGIN;` seguido de `SELECT public.finish_agent_attempt('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','unknown');`. Mantenha A aberta, sem `COMMIT`.
2. Em B, execute `BEGIN; SET LOCAL lock_timeout='10s';` e inicie `SELECT * FROM public.reserve_image_tool_call('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',1,'44444444-4444-4444-8444-444444444444','sess_a','turn_a','call_a');`. A chamada deve aguardar A. Na observadora C, antes do timeout, confira `SELECT application_name, wait_event_type, pg_blocking_pids(pid) FROM pg_stat_activity WHERE application_name='compor_race_b';` e compare o PID bloqueador com A. Timeout isolado não prova qual sessão bloqueou.
3. Se B expirar, registre o erro de lock, faça `ROLLBACK` em B e execute `COMMIT` em A. Em uma nova transação B, repita a reserva: deve ser rejeitada com `42501`, sem nova linha em `image_tool_reservations` para `call_a`. Confirme a ausência como administrador em C. Se o cliente encerrar ao erro, reabra B e verifique o PID.

## Ordem 2: reserva antes da finalização

1. Em A, inicie uma transação e reserve usando os mesmos projeto/peça/versão, tentativa `55555555-5555-4555-8555-555555555555` e IDs `sess_b`, `turn_b`, `call_b`. Deve retornar `is_new=true`; mantenha A sem commit.
2. Em B, inicie uma transação com `lock_timeout='10s'` e chame `finish_agent_attempt` para a tentativa `55555555-5555-4555-8555-555555555555`, estado `unknown`. Confirme em C que B aguarda o PID de A. Após o timeout de B, faça rollback de B, commit de A e repita a finalização em B: deve retornar `true`.
3. Repita em B a mesma reserva `sess_b`/`turn_b`/`call_b`: deve retornar o mesmo identificador, `is_new=false` e estado `reserved`. Uma chamada nova, por exemplo `call_c`, deve ser rejeitada após a finalização. Confirme como administrador que existe uma única linha para a tríade original. `reserved` não comprova que uma imagem foi gerada e não autoriza nova cobrança.

Registre versões PostgreSQL, PIDs, sequência, erros, resultados e saída sanitizada; não inclua segredos ou conteúdo pessoal. Ao terminar, encerre somente o servidor iniciado para esta prova e apenas se o processo e diretório forem de propriedade exclusiva desta tarefa. Preserve os artefatos até revisão; não aplique esses passos ao Supabase real.
