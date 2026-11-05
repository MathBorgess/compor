# Pacote de migração e prova do estúdio

Preparado em 5 de novembro de 2026 para o projeto de teste Supabase
`dpboawdnuxuzjoufpiry`. Preparação local e testes isolados não representam
aplicação remota, autenticação real pelo Google ou uma jornada com a OpenAI.

## Ordem operacional

1. Manter `COMPOR_STUDIO_WEB_ENABLED` e `COMPOR_STUDIO_CHAT_ENABLED` desabilitadas.
2. Preparar e revisar o SQL de aplicação e o SQL de prova.
3. Aplicar o pacote uma única vez no projeto de teste autorizado.
4. Executar a prova de isolamento com `ROLLBACK` e conferir a evidência.
5. Somente depois habilitar as flags, publicar e verificar a jornada real.

Se houver erro, perda de conexão ou confirmação incerta, parar e inspecionar a
auditoria e a evidência. Não repetir aplicação nem modificar o pacote gerado.

## Preparação, sem conexão ao banco

Executar a partir da raiz do repositório:

```sh
python3 -B scripts/prepare_studio_migrations.py
python3 -B scripts/prepare_studio_migrations.py --proof
```

Cada comando imprime JSON com o caminho absoluto de um arquivo privado e seu
SHA-256. A preparação não recebe senha nem chave. O pacote inclui os blobs
exatos de `00013` e `00014` dos commits revisados:

| Migração | Commit de origem | SHA-256 do blob |
| --- | --- | --- |
| `20261105000013_studio_turn_metadata.sql` | `4cc8f9ebe372f5f2ea028c6ff480998778ee99c1` | `7d8fd22588e865ebac063c62be57f9bb7e89d3cd24d9beacae705886a1a12c9e` |
| `20261105000014_version_metadata.sql` | `237b1dde1159408a430bd447e7000a4ef176f28a` | `e6b01622c81d2f86d13175c9def11938f932d2c1b9abc44d426d06c5bd5fa62f` |

Os wrappers comparam os bytes completos antes de conectar. Mudança no arquivo,
symlink, CA diferente ou histórico divergente cancela a operação.

## Comandos após revisão do pacote

Substituir os caminhos abaixo pelos caminhos absolutos impressos na preparação.
A senha será solicitada apenas pelo `psql`, no Terminal.

```sh
sh scripts/apply_studio_test_project.sh /caminho/absoluto/apply.sql /caminho/absoluto/proof.sql /caminho/absoluto/supabase-ca.crt
```

O comando valida os dois arquivos antes de conectar, solicita a senha **uma vez**
e passa ambos para o mesmo processo `psql`: aplicação com `COMMIT`, seguida da
prova com `ROLLBACK`. Uma falha posterior ao `COMMIT` não desfaz as migrações. O
wrapper identifica esse caso e manda inspecionar a evidência, sem repetir a
aplicação. Depois de corrigir a causa, somente a prova pode ser executada:

```sh
sh supabase/tests/studio_rls_capture.sh /caminho/absoluto/proof.sql /caminho/absoluto/supabase-ca.crt
```

O destino fica fixo em `db.dpboawdnuxuzjoufpiry.supabase.co:5432`, banco e usuário
`postgres`. Os wrappers usam `env -i`, `psql -X -W`, `ON_ERROR_STOP`,
`sslmode=verify-full`, `gssencmode=disable` e a CA oficial com fingerprint
SHA-256 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
Variáveis herdadas como `PGHOST`, `PGOPTIONS` e `PGPASSWORD` não chegam ao cliente.
A saída SQL inclui a versão TLS, cipher e bits observados em `pg_stat_ssl`.

## Guardas e efeitos

A aplicação usa uma transação e a mesma trava consultiva dos pacotes anteriores.
Revalida a estrutura e as permissões da auditoria antes e depois de adquirir sua
trava. Exige exatamente as **13 entradas anteriores**, com nome, commit e hash,
incluindo recuperação e imagem 2.6. Não pressupõe que a numeração temporal das
migrações corresponda à ordem em que foram aplicadas.

Antes do DDL, verifica proprietário, RLS, colunas, ausência dos novos objetos e o
corpo/permissões da RPC legada que será substituída. Recusa triggers externos,
rules, herança, tipos e funções inesperadas em defaults/constraints/políticas.
A exceção gerenciada para `auth.users.confirmed_at` exige os tipos e a expressão
exata `LEAST(email_confirmed_at, phone_confirmed_at)` já revisados.

As duas migrações e as duas entradas de auditoria são confirmadas juntas. As
**15 entradas finais**, colunas e corpos/permissões das novas RPCs são conferidos
antes do `COMMIT`. O wrapper exige a linha `COMMIT` na evidência; mesmo assim,
uma confirmação ausente após desconexão exige reconciliação, nunca repetição.

## Prova de isolamento e preservação

Executar sem outras gravações ou DDL em andamento. A prova pode bloquear
temporariamente gravações e autenticações, pois trava `auth.users`, projetos,
versões, tentativas e as três novas tabelas. `lock_timeout` é 5 segundos e cada
statement tem limite de 30 segundos. Mais de 10 mil linhas em uma tabela do
snapshot cancela a prova antes das fixtures.

A prova cria duas identidades e projetos com UUIDs novos. Exercita reserva,
idempotência, conflito, serialização por projeto, vínculo único, estados
terminais e recibos de ações. Confere leitura própria e negação cruzada de todas
as novas RPCs, negação de acesso direto às tabelas técnicas, metadados isolados,
aprovação explícita/herdada, ramificação de versão anterior, contrato MCP antigo,
renomeação com revisão e rejeição de conteúdo ou bases inválidas.

Antes das fixtures, calcula contagem e checksum SHA-256 dos registros das sete
tabelas envolvidas e da auditoria. Os checksums ficam em variáveis do `psql`;
nenhuma linha existente nem conteúdo criativo é copiado para a evidência. Depois
do `ROLLBACK`, exige os mesmos snapshots. O wrapper aceita sucesso somente com
`ROLLBACK` e `STUDIO_RLS_CHECKS_PASSED_AND_ROLLED_BACK` na captura privada.

O fragmento `studio_rls_rollback_body.sql` não deve ser executado diretamente:
depende das guardas, travas e snapshots inseridos pelo preparador, e contém uma
recusa inicial contra invocação acidental fora do pacote.

## Validação local e limites

```sh
cd packages/private-images
node --test test/studio-prepare-apply.test.mjs
```

Os testes aplicam o histórico e o pacote em PGlite, recusam drift e aplicação
parcial, injetam falha antes da auditoria e executam a prova real pelo `psql`
contra o socket local. Também comprovam recusa de política permissiva, trigger,
coluna inesperada e snapshot alterado, além da fixação de TLS/destino nos wrappers.

PGlite usa uma conexão e identidades sintéticas por `SET ROLE`/claims. Isso não
prova verificação de JWT pelo Supabase, sessões Google reais, concorrência em
conexões PostgreSQL independentes, Storage, Codex ou geração de imagem. O socket
local não usa TLS; TLS do destino remoto permanece uma verificação operacional
do wrapper e da evidência de conexão.
