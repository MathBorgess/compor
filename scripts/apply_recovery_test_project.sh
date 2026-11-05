#!/bin/sh
# Dedicated test project only. Password is entered at the psql prompt.
set -eu
if [ "$#" -ne 2 ]; then
  printf '%s\n' 'Uso: script /caminho/absoluto/apply.sql /caminho/absoluto/ca-oficial.crt' >&2
  exit 2
fi
sql_path=$1
ca_file=$2
case "$sql_path" in /*) :;; *) exit 2;; esac
case "$ca_file" in /*) :;; *) exit 2;; esac
[ -f "$ca_file" ] && [ -r "$ca_file" ] || exit 2
expected='sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA'
actual=$(openssl x509 -in "$ca_file" -noout -fingerprint -sha256) || exit 2
[ "$actual" = "$expected" ] || { printf '%s\n' 'CA inesperada; conexão cancelada.' >&2; exit 2; }
script_dir=$(CDPATH= cd -P "$(dirname "$0")" && pwd -P)
python3 "$script_dir/prepare_recovery_migration.py" --verify "$sql_path"
umask 077
evidence=$(mktemp "${TMPDIR:-/tmp}/compor-recovery-result.XXXXXXXX")
printf 'Evidência privada: %s\n' "$evidence"
if env -i PATH="$PATH" PGSSLMODE=verify-full PGGSSENCMODE=disable PGSSLROOTCERT="$ca_file" \
  psql -X -W -v ON_ERROR_STOP=1 -h db.dpboawdnuxuzjoufpiry.supabase.co -p 5432 \
  -U postgres -d postgres -f "$sql_path" -o "$evidence"; then
  printf '%s\n' 'psql concluiu; confira COMMIT e as treze entradas na evidência.'
else
  printf '%s\n' 'psql falhou ou confirmação incerta; não repita sem inspecionar banco e evidência.' >&2
  exit 1
fi
