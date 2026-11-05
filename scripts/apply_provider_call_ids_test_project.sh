#!/bin/sh
# Dedicated pilot only; never pass a password through args, env or a file.
set -eu
if [ "$#" -ne 3 ]; then
  printf '%s\n' 'Uso: script /caminho/absoluto/apply.sql /caminho/absoluto/proof.sql /caminho/absoluto/ca-oficial.crt' >&2
  exit 2
fi
sql_path=$1
proof_path=$2
ca_file=$3
case "$sql_path" in /*) :;; *) exit 2;; esac
case "$proof_path" in /*) :;; *) exit 2;; esac
case "$ca_file" in /*) :;; *) exit 2;; esac
[ -f "$ca_file" ] && [ -r "$ca_file" ] || exit 2
expected='sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA'
actual=$(openssl x509 -in "$ca_file" -noout -fingerprint -sha256) || exit 2
[ "$actual" = "$expected" ] || { printf '%s\n' 'CA inesperada; conexão cancelada.' >&2; exit 2; }
script_dir=$(CDPATH= cd -P "$(dirname "$0")" && pwd -P)
python3 -B "$script_dir/prepare_provider_call_ids_migration.py" --verify "$sql_path"
python3 -B "$script_dir/prepare_provider_call_ids_migration.py" --verify-proof "$proof_path"
umask 077
evidence=$(mktemp "${TMPDIR:-/tmp}/compor-call-ids-migration-result.XXXXXXXX")
printf 'Evidência privada: %s\n' "$evidence"
if env -i PATH="$PATH" PGSSLMODE=verify-full PGGSSENCMODE=disable PGSSLROOTCERT="$ca_file" \
  psql -X -W -v ON_ERROR_STOP=1 -h db.dpboawdnuxuzjoufpiry.supabase.co -p 5432 \
  -U postgres -d postgres -f "$sql_path" -f "$proof_path" -o "$evidence"; then
  if ! grep -qx 'COMMIT' "$evidence" || ! grep -qx 'ROLLBACK' "$evidence" || ! grep -q 'PROVIDER_CALL_IDS_RLS_CHECKS_PASSED_AND_ROLLED_BACK' "$evidence"; then
    printf 'Validação incompleta; a migração pode estar aplicada. Não repita; inspecione: %s\n' "$evidence" >&2
    exit 1
  fi
  printf '%s\n' 'psql concluiu: COMMIT das migrações e ROLLBACK da prova presentes; confira TLS e dezessete entradas.'
else
  if grep -qx 'COMMIT' "$evidence"; then
    printf '%s\n' 'Migrações já aplicadas (COMMIT presente), mas a prova não concluiu. Não repita a aplicação; inspecione a evidência e execute somente a prova depois da correção.' >&2
  else
    printf '%s\n' 'psql falhou ou confirmação incerta; não repita sem inspecionar banco e evidência.' >&2
  fi
  exit 1
fi
