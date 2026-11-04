#!/bin/sh
# Metadata-only capture; operator must verify the target and trusted CA first.
set -eu
LC_ALL=C; export LC_ALL
fail() { printf '%s\n' 'Destino inválido; preflight não iniciado.' >&2; exit 2; }

COMPOR_DB_HOST=${COMPOR_DB_HOST-}
COMPOR_DB_PORT=${COMPOR_DB_PORT-}
COMPOR_DB_USER=${COMPOR_DB_USER-}
COMPOR_DB_NAME=${COMPOR_DB_NAME-}
COMPOR_CA_CERT=${COMPOR_CA_CERT-}

# A simple database name prevents libpq from treating -d as conninfo or URI.
case "$COMPOR_DB_NAME" in ''|[!A-Za-z_]*|*[!A-Za-z0-9_]*) fail;; esac
[ "${#COMPOR_DB_NAME}" -le 63 ] || fail
case "$COMPOR_DB_USER" in ''|[!A-Za-z_]*|*[!A-Za-z0-9_.-]*) fail;; esac
[ "${#COMPOR_DB_USER}" -le 128 ] || fail
case "$COMPOR_DB_PORT" in ''|*[!0-9]*) fail;; esac
[ "${#COMPOR_DB_PORT}" -le 5 ] && [ "$COMPOR_DB_PORT" -ge 1 ] && [ "$COMPOR_DB_PORT" -le 65535 ] || fail
case "$COMPOR_DB_HOST" in ''|*[!A-Za-z0-9.-]*|.*|*.|*..*) fail;; esac
case "$COMPOR_DB_HOST" in *.*) :;; *) fail;; esac
case "$COMPOR_DB_HOST" in *[!0-9.]*) :;; *) fail;; esac
[ "${#COMPOR_DB_HOST}" -le 253 ] || fail
set -f
old_ifs=$IFS; IFS=.; set -- $COMPOR_DB_HOST; IFS=$old_ifs
for label do
  case "$label" in ''|-*|*-) fail;; esac
  [ "${#label}" -le 63 ] || fail
done
[ -f "$COMPOR_CA_CERT" ] && [ -r "$COMPOR_CA_CERT" ] || fail
script_dir=$(CDPATH= cd -P "$(dirname "$0")" && pwd -P)
[ -f "$script_dir/preflight_readonly.sql" ] || fail

umask 077
capture_dir=$(mktemp -d "${TMPDIR:-/tmp}/compor-preflight.XXXXXXXX") || exit 1
output=$capture_dir/preflight.txt
# -W forces an interactive password prompt; inherited PG* settings are removed.
if env -i PATH="$PATH" PGSSLMODE=verify-full PGSSLROOTCERT="$COMPOR_CA_CERT" \
  psql -X -W -v ON_ERROR_STOP=1 -h "$COMPOR_DB_HOST" -p "$COMPOR_DB_PORT" \
  -U "$COMPOR_DB_USER" -d "$COMPOR_DB_NAME" -f "$script_dir/preflight_readonly.sql" -o "$output"; then
  printf '%s\n' "$output"
else
  printf 'Falhou; captura parcial não é evidência: %s\n' "$output" >&2
  exit 1
fi
