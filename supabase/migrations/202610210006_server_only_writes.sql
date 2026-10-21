-- Enforce Edge-only writes: authenticated clients retain SELECT through RLS,
-- but cannot INSERT/UPDATE/DELETE any private learning rows.
begin;
revoke insert,update,delete,truncate,references,trigger on
 lexigo.assignments,lexigo.assignment_recipients,lexigo.attempts,
 lexigo.attempt_events from authenticated,anon,public;
-- Column grants are independent of table grants in PostgreSQL.
revoke update(status,finished_at) on lexigo.attempts from authenticated,anon,public;
drop policy if exists assignment_create on lexigo.assignments;
drop policy if exists recipient_create on lexigo.assignment_recipients;
drop policy if exists attempt_create on lexigo.attempts;
drop policy if exists attempt_finish on lexigo.attempts;
drop policy if exists event_create on lexigo.attempt_events;
-- Guard against accidental default privileges from future schema changes.
alter default privileges in schema lexigo revoke insert,update,delete on tables from public;
commit;
