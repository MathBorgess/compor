#!/bin/sh
# ONLY the dedicated Compor test project. The operator enters the DB password
# at the psql prompt; it must not appear in an argument or environment variable.
set -eu
if [ "$#" -ne 3 ]; then
  printf '%s\n' 'Uso: script SHA_COMPLETO /caminho/absoluto/apply.sql /caminho/absoluto/ca-oficial.crt' >&2
  exit 2
fi
source_commit=$1
sql_path=$2
ca_file=$3
case "$sql_path" in /*) :;; *) exit 2;; esac
case "$ca_file" in /*) :;; *) exit 2;; esac
[ -f "$ca_file" ] && [ -r "$ca_file" ] || exit 2
expected='sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA'
actual=$(openssl x509 -in "$ca_file" -noout -fingerprint -sha256) || exit 2
[ "$actual" = "$expected" ] || { printf '%s\n' 'CA inesperada; conexão cancelada.' >&2; exit 2; }
script_dir=$(CDPATH= cd -P "$(dirname "$0")" && pwd -P)
python3 "$script_dir/prepare_compor_migrations.py" --verify "$source_commit" "$sql_path"
umask 077
evidence=$(mktemp "${TMPDIR:-/tmp}/compor-migration-result.XXXXXXXX")
printf 'Evidência privada: %s\n' "$evidence"
if env -i PATH="$PATH" PGSSLMODE=verify-full PGGSSENCMODE=disable PGSSLROOTCERT="$ca_file" \
  psql -X -W -v ON_ERROR_STOP=1 -h db.dpboawdnuxuzjoufpiry.supabase.co -p 5432 \
  -U postgres -d postgres -f "$sql_path" -o "$evidence"; then
  printf '%s\n' 'psql concluiu; confira COMMIT e as onze entradas na evidência.'
else
  printf '%s\n' 'psql falhou ou a confirmação é incerta; não repita sem inspecionar o banco e a evidência.' >&2
  exit 1
fi
