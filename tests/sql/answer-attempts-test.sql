-- Run only in the disposable SQL test database, after the migration.
\set ON_ERROR_STOP 1
create or replace function pg_temp.check_attempt(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'FAIL: %',msg; end if; end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000001','attempt1@example.test','{"role":"student"}'),
 ('10000000-0000-0000-0000-000000000002','attempt2@example.test','{"role":"student"}');
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
select public.submit_answer_attempts('[{"event_id":"20000000-0000-0000-0000-000000000001","client_session_id":"session-a1","word_id":"w1","mode":"quiz","correct":false,"skill":"recognition","hinted":false,"retry":false,"answered_at":"2026-01-01T00:00:00Z"}]',auth.uid());
select public.submit_answer_attempts('[{"event_id":"20000000-0000-0000-0000-000000000001","client_session_id":"session-a1","word_id":"w1","mode":"quiz","correct":false,"skill":"recognition","hinted":false,"retry":false,"answered_at":"2026-01-01T00:00:00Z"}]',auth.uid());
select pg_temp.check_attempt((select count(*) from public.answer_attempts)=1,'duplicate event');
select pg_temp.check_attempt((select xp from public.user_stats where user_id=auth.uid())=0,'history does not award XP');
do $$ begin
 perform public.submit_answer_attempts('[{"event_id":"20000000-0000-0000-0000-000000000001","client_session_id":"session-a1","word_id":"w1","mode":"quiz","correct":true,"skill":"recognition","hinted":false,"retry":false,"answered_at":"2026-01-01T00:00:00Z"}]',auth.uid());
 raise exception 'FAIL: conflicting event accepted';
exception when invalid_parameter_value then null; end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
select pg_temp.check_attempt((select count(*) from public.answer_attempts)=0,'other student cannot read history');
do $$ begin
 perform public.submit_session_for_user('{"client_id":"session-a2","mode":"quiz","events":[]}', '10000000-0000-0000-0000-000000000001');
 raise exception 'FAIL: session accepted for wrong account';
exception when insufficient_privilege then null; end $$;
do $$ begin
 perform public.submit_answer_attempts('[]', '10000000-0000-0000-0000-000000000001');
 raise exception 'FAIL: event batch accepted for wrong account';
exception when insufficient_privilege then null; end $$;
do $$ begin
 perform public.submit_answer_attempts('[{"event_id":"20000000-0000-0000-0000-000000000001","client_session_id":"session-a1","word_id":"w1","mode":"quiz","correct":false,"skill":"recognition","hinted":false,"retry":false,"answered_at":"2026-01-01T00:00:00Z"}]',auth.uid());
 raise exception 'FAIL: another user reused event id';
exception when invalid_parameter_value then null; end $$;
reset role;
delete from auth.users where id='10000000-0000-0000-0000-000000000001';
select pg_temp.check_attempt((select count(*) from public.answer_attempts where user_id='10000000-0000-0000-0000-000000000001')=0,'account deletion cascades');
select 'answer attempts: PASS';
