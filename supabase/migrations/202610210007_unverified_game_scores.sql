-- Client-supplied correctness is untrusted. Do not treat it as graded evidence.
-- Only a future server-side answer evaluator may set verified_correct.
begin;
alter table lexigo.attempt_events
 add column verified_correct boolean,
 add column verification_source text not null default 'client_unverified'
 check(verification_source in ('client_unverified','server_evaluated'));
alter table lexigo.attempt_events
 add constraint verified_correct_requires_server
 check ((verification_source='client_unverified' and verified_correct is null)
 or (verification_source='server_evaluated' and verified_correct is not null));
-- No public API to set verification_source=server_evaluated.
-- The current append_event_atomic leaves both columns at their safe defaults.
commit;
