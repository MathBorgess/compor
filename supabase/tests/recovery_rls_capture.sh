#!/bin/sh
# Dedicated Compor test project only. Password stays in psql's prompt.
set -eu
if [ "$#" -ne 1 ]; then printf '%s\n' 'Uso: script /caminho/absoluto/ca-oficial.crt' >&2; exit 2; fi
ca_file=$1
case "$ca_file" in /*) :;; *) exit 2;; esac
[ -f "$ca_file" ] && [ -r "$ca_file" ] || exit 2
expected='sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA'
actual=$(openssl x509 -in "$ca_file" -noout -fingerprint -sha256) || exit 2
[ "$actual" = "$expected" ] || { printf '%s\n' 'CA inesperada; conexão cancelada.' >&2; exit 2; }
script_dir=$(CDPATH= cd -P "$(dirname "$0")" && pwd -P)
sql_path="$script_dir/recovery_rls_rollback.sql"
expected_sql='e49f6df0f1669179a9d7df2b94b2375cdf14d0ca7f6829e75d5e21cf102e61b7'
actual_sql=$(shasum -a 256 "$sql_path" | cut -d ' ' -f1)
[ "$actual_sql" = "$expected_sql" ] || { printf '%s\n' 'SQL inesperado; teste cancelado.' >&2; exit 2; }
umask 077
capture_dir=$(mktemp -d "${TMPDIR:-/tmp}/compor-recovery-rls.XXXXXXXX")
output=$capture_dir/result.txt
if env -i PATH="$PATH" PGSSLMODE=verify-full PGGSSENCMODE=disable PGSSLROOTCERT="$ca_file" \
  psql -X -W -v ON_ERROR_STOP=1 -h db.dpboawdnuxuzjoufpiry.supabase.co -p 5432 \
  -U postgres -d postgres -f "$sql_path" -o "$output"; then
  if ! grep -qx 'ROLLBACK' "$output" || ! grep -q 'RECOVERY_RLS_CHECKS_PASSED_AND_ROLLED_BACK' "$output"; then
    printf 'Falhou; faltam evidências de rollback e isolamento: %s\n' "$output" >&2
    exit 1
  fi
  printf '%s\n' "$output"
else
  printf 'Falhou; captura parcial não é evidência: %s\n' "$output" >&2
  exit 1
fi
