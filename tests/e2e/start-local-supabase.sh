#!/usr/bin/env bash
# Local Supabase-compatible stack for the cloud E2E test: PostgreSQL 15+/16 + GoTrue (Supabase Auth)
# + PostgREST + a tiny proxy on :54321 that imitates https://<project>.supabase.co.
# Requires: postgres binaries, curl, node. Binaries are downloaded from the official GitHub releases.
set -euo pipefail
trap 'echo "Local Supabase test setup failed at line $LINENO" >&2' ERR
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; W="${WORK:-/tmp/lexigo-supabase}"; mkdir -p "$W"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"; PGPORT=54329; SECRET="lexigo-local-test-secret-0123456789abcdef"
[ -x "$W/postgrest" ] || { curl -sSL https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz | tar xJ -C "$W"; }
[ -x "$W/auth" ] || { curl -sSL https://github.com/supabase/auth/releases/download/v2.180.0/auth-v2.180.0-x86.tar.gz | tar xz -C "$W"; }
if [ ! -d "$W/pg" ]; then "$PGBIN/initdb" -D "$W/pg" -U postgres -A trust >/dev/null; fi
"$PGBIN/pg_ctl" -D "$W/pg" -o "-p $PGPORT -k $W" -l "$W/pg.log" status >/dev/null 2>&1 || "$PGBIN/pg_ctl" -D "$W/pg" -o "-p $PGPORT -k $W" -l "$W/pg.log" start >/dev/null
sleep 1
P="psql -h $W -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists lexigo_e2e" -c "create database lexigo_e2e"
$P -d lexigo_e2e -f "$ROOT/tests/e2e/db-bootstrap.sql"
export GOTRUE_API_HOST=127.0.0.1 PORT=9999 API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 GOTRUE_DB_DRIVER=postgres \
  DATABASE_URL="postgres://supabase_auth_admin@127.0.0.1:$PGPORT/lexigo_e2e?sslmode=disable" DB_NAMESPACE=auth \
  GOTRUE_SITE_URL=http://127.0.0.1:4173 GOTRUE_URI_ALLOW_LIST="http://127.0.0.1:4173/**" GOTRUE_JWT_SECRET="$SECRET" GOTRUE_JWT_EXP=3600 \
  GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role GOTRUE_DISABLE_SIGNUP=false \
  GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_PASSWORD_MIN_LENGTH=8 GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_LOG_LEVEL=warn
( cd "$W" && ./auth migrate >/dev/null )
$P -d lexigo_e2e -c "grant usage on schema auth to anon, authenticated, service_role; grant execute on all functions in schema auth to anon, authenticated, service_role;"
# Push scheduling/network extensions are unavailable in this isolated test server.
# Keep the production schema untouched and omit only extension setup and cron jobs.
sed -e '/^create extension if not exists pg_net /d' -e '/^create extension if not exists pg_cron;/d' -e '/^select cron\./d' "$ROOT/supabase/schema.sql" > "$W/schema-test.sql"
$P -d lexigo_e2e -f "$W/schema-test.sql" >/dev/null
( cd "$W" && nohup ./auth serve > "$W/auth.log" 2>&1 & )
printf 'db-uri = "postgres://authenticator@127.0.0.1:%s/lexigo_e2e"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "%s"\nserver-host = "127.0.0.1"\nserver-port = 3000\n' "$PGPORT" "$SECRET" > "$W/pgrst.conf"
( nohup "$W/postgrest" "$W/pgrst.conf" > "$W/pgrst.log" 2>&1 & )
( nohup node "$ROOT/tests/e2e/proxy.mjs" > "$W/proxy.log" 2>&1 & )
sleep 3
ANON=$(node -e 'const c=require("crypto"),s=process.argv[1],b=o=>Buffer.from(JSON.stringify(o)).toString("base64url"),h=b({alg:"HS256",typ:"JWT"}),p=b({role:"anon",iss:"supabase",iat:1700000000,exp:2000000000});console.log(h+"."+p+"."+c.createHmac("sha256",s).update(h+"."+p).digest("base64url"))' "$SECRET")
echo "export CLOUD_ANON=$ANON"
echo "export PSQL='psql -h $W -p $PGPORT -U postgres -d lexigo_e2e -Atc'"
