# Isolated database checks

`node tests/sql/core.mjs` runs the actual PostgreSQL schema, RLS policies, result submission and migration/rollback in PGlite. Install the test-only dependency with `npm install --no-save @electric-sql/pglite@0.5.15`. No production URL, credentials or persistent database are used.

The suite loads `supabase-shim.sql` for `auth.users` and `auth.uid()`, checks schema idempotence, runs `rls-test.sql` and `answer-history.sql`, then rolls back and reapplies the final-test migration without losing sessions. PostgreSQL executes access policies under separate authenticated user IDs. It does not emulate their result in JavaScript.

The optional `pg_net`/`pg_cron` push section is excluded. These checks do not replace GoTrue, PostgREST, push-worker or cross-device HTTP integration tests. Use the full local Supabase stack described in `tests/e2e/README.md` for those.

`run.sh` remains the alternative for a disposable native PostgreSQL database with the extensions required by the full schema. Never point either test suite at production.

