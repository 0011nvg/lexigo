# Answer-attempts migration — DRAFT, do not deploy

This migration has not been tested against an actual PostgreSQL/Supabase installation. It does not replace session processing, synchronize progress, or grant teachers access. Run it first in an isolated environment with production-like *synthetic* data. Obtain a backup and restore it successfully in isolation before any live change. Do not transfer actual pupil data to another region.

## Required write freeze

The migration's timestamp cutoff is not a transaction boundary. A session transaction started before the cutoff can commit after the backfill and be omitted. Before applying, disable **all** session submissions and other session inserts on the server, stop old and new app clients from writing, and drain/finish all in-flight write transactions. Keep the freeze until the migration and reconciliation are complete. Do not rely on a maintenance message or client-side disabling alone. Verify the cutoff and actual completed transactions with an administrator. If a complete freeze cannot be achieved, this backfill is not safe to run; design a transaction-safe capture/reconciliation process first.

After migration, compare these counts while the write freeze remains in place. The first query counts only entries the migration actually supports; the second counts transferred legacy entries. Unknown fields or malformed entries are not invented and remain in `sessions.events`.

```sql
select count(*) as eligible
from public.sessions s
cross join lateral jsonb_array_elements(case when jsonb_typeof(s.events)='array' then s.events else '[]'::jsonb end) with ordinality e(item,ord)
where s.created_at <= (select started_at from public.answer_attempts_migration_state where name='legacy_v1')
 and e.item->>'w' ~ '^[A-Za-z0-9_.:-]{1,60}$'
 and e.item->>'ok' in ('true','false')
 and coalesce(e.item->>'k','recognition') in ('recognition','recall','self')
 and coalesce(e.item->>'h','false') in ('true','false')
 and coalesce(e.item->>'r','false') in ('true','false');
select count(*) as transferred from public.answer_attempts where legacy_ordinal is not null;
```

The counts must match. Investigate any discrepancy before resuming writes; also compare counts per session and inspect rejected/non-array events. Matching counts alone does not prove correctness or absence of earlier incomplete transactions. No old source events are deleted. Times of old individual answers are unknown and remain null; `received_at` is migration insertion time, not answer time. Individual answer text is not stored.

A post-cutoff `sessions.events` backfill is deliberately not automatic, to avoid creating duplicates alongside the new per-event client. Old clients can still submit sessions after rollout: they will not produce individual history until a separately designed reconciliation mechanism exists. Do not advertise complete history until old clients are retired and this gap is resolved. Events saved during a session are not themselves processed for XP or word progress by this migration; existing `submit_session` is still necessary.

## Rollback

Keep a verified restorable backup throughout. First stop clients from calling the new RPC. A schema rollback requires dropping the new RPC and tables, which destroys all *new* history not also in old sessions. Export and verify those rows first, agree on retention, and use a reviewed rollback script; restoring a whole database can also erase newer unrelated work. Prefer a forward fix or disabling the new feature. Do not execute destructive rollback on the live database without a separate reviewed plan.

For SQL checks in a disposable database with the shim and base schema already installed:

```sh
psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/migrations/20261104_answer_attempts.sql
psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f supabase/migrations/20261104_answer_attempts.sql
psql -v ON_ERROR_STOP=1 -d "$TEST_DB" -f tests/sql/answer-attempts-test.sql
```

The repeated migration is intentional. These checks are prepared but have not been executed here. The shim is not a substitute for testing with actual Supabase Auth, PostgREST, and RLS.
