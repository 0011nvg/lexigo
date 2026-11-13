#!/usr/bin/env bash
# Runs the cloud schema tests against a throw-away PostgreSQL database.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres tests/sql/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=lexigo_schema_test
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d $DB -f tests/sql/supabase-shim.sql
schema=$(mktemp)
trap 'rm -f "$schema"' EXIT
# Hosted push extensions and cron are not installed in the isolated PostgreSQL runner.
sed -e '/^create extension if not exists pg_net /d' -e '/^create extension if not exists pg_cron;/d' -e '/^select cron\./d' supabase/schema.sql > "$schema"
psql -v ON_ERROR_STOP=1 -q -d $DB -f "$schema" >/dev/null 2>&1 || psql -v ON_ERROR_STOP=1 -d $DB -f "$schema"
psql -v ON_ERROR_STOP=1 -q -d $DB -f "$schema" >/dev/null 2>&1   # idempotent re-run
psql -v ON_ERROR_STOP=1 -q -At -d $DB -f tests/sql/rls-test.sql | tail -1
psql -v ON_ERROR_STOP=1 -q -At -d $DB -f tests/sql/answer-history.sql | tail -1
