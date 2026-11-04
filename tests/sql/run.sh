#!/usr/bin/env bash
# Runs schema tests in a uniquely named, disposable LOCAL PostgreSQL database.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres tests/sql/run.sh
# This script must never be pointed at production, even a local production server.
set -euo pipefail
cd "$(dirname "$0")/../.."
case "${PGHOST:-}" in
  *,*) echo 'Multiple hosts are not permitted.' >&2; exit 1 ;;
  ''|/*|localhost|127.0.0.1|::1) ;;
  *) echo 'Refusing remote PGHOST: use an isolated local PostgreSQL test server.' >&2; exit 1 ;;
esac
if [[ -n "${PGSERVICE:-}" || -n "${PGDATABASE:-}" || -n "${PGHOSTADDR:-}" ]]; then
  echo 'Unset PGSERVICE, PGDATABASE and PGHOSTADDR; use an isolated local test server.' >&2
  exit 1
fi
DB="lexigo_test_$(date +%s)_${RANDOM}_$$"
created=0
cleanup() {
  if [[ "$created" == 1 ]]; then
    psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database $DB" || echo "Remove test database $DB manually." >&2
  fi
}
trap cleanup EXIT
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $DB"
created=1
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f tests/sql/supabase-shim.sql
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/schema.sql
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/schema.sql  # idempotent re-run
psql -v ON_ERROR_STOP=1 -q -At -d "$DB" -f tests/sql/rls-test.sql | tail -1
