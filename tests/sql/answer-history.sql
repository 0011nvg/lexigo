-- Run after schema.sql in an isolated database, never against production.
reset role;
create or replace function pg_temp.history_user(u uuid) returns void language sql as $$select set_config('request.jwt.claim.sub',u::text,false)$$;
create or replace function pg_temp.history_check(ok boolean,msg text) returns void language plpgsql as $$begin if not coalesce(ok,false) then raise exception 'FAIL history: %',msg;end if;end$$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000001','history-pupil@example.test','{"role":"student","display_name":"Тестовый ученик"}'),
 ('10000000-0000-0000-0000-000000000002','history-peer@example.test','{"role":"student","display_name":"Другой ученик"}'),
 ('10000000-0000-0000-0000-000000000003','history-teacher@example.test','{"role":"teacher","display_name":"Тестовый учитель"}'),
 ('10000000-0000-0000-0000-000000000004','history-outsider@example.test','{"role":"teacher","display_name":"Другой учитель"}');
create temp table history_context(k text primary key,v text);grant all on history_context to authenticated;
set role authenticated;
select pg_temp.history_user('10000000-0000-0000-0000-000000000003');
insert into history_context select 'code',join_code from create_group('История — тест');
select pg_temp.history_user('10000000-0000-0000-0000-000000000001');
select join_group((select v from history_context where k='code'));
select submit_session('{"client_id":"history-detail-001","mode":"audio","finished":true,"events":[{"w":"hist_apple","ok":false,"k":"recall","m":"audio","answer":"aplpe","expected":"apple","answered_at":"2026-11-08T08:00:00Z","attempt_index":1},{"w":"hist_apple","ok":true,"k":"recall","m":"audio","r":true,"answer":"apple","expected":"apple","answered_at":"2026-11-08T08:01:00Z","attempt_index":2}]}'::jsonb);
select pg_temp.history_check((select events->0->>'answer'='aplpe' and events->1->>'answer'='apple' and events->1->>'r'='true' and events->0->>'expected'='apple' from sessions where client_id='history-detail-001'),'submitted and retry answers preserved');
select submit_session('{"client_id":"history-detail-001","mode":"audio","events":[]}'::jsonb);
select pg_temp.history_check((select count(*)=1 from sessions where client_id='history-detail-001'),'duplicate submission is idempotent');
select pg_temp.history_user('10000000-0000-0000-0000-000000000002');
select pg_temp.history_check((select count(*)=0 from sessions where client_id='history-detail-001'),'another pupil cannot read the answers');
select pg_temp.history_user('10000000-0000-0000-0000-000000000003');
select pg_temp.history_check((select count(*)=1 from sessions where client_id='history-detail-001'),'own teacher can read the answers');
select pg_temp.history_user('10000000-0000-0000-0000-000000000004');
select pg_temp.history_check((select count(*)=0 from sessions where client_id='history-detail-001'),'another teacher cannot read the answers');
select pg_temp.history_user('10000000-0000-0000-0000-000000000001');
do $$begin
 begin perform submit_session(jsonb_build_object('client_id','history-too-long','mode','audio','events',jsonb_build_array(jsonb_build_object('w','hist_big','ok',false,'answer',repeat('x',201)))));raise exception 'FAIL history: accepted long answer';
 exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform submit_session('{"client_id":"history-bad-date","mode":"audio","events":[{"w":"hist_date","ok":false,"answered_at":"not-a-date"}]}');raise exception 'FAIL history: accepted invalid timestamp';
 exception when invalid_datetime_format then null;end;
end$$;
-- Four out of five first answers and a corrected retry pass the agreed 80% rule.
select submit_session(jsonb_build_object('client_id','history-boss-80','mode','boss','finished',true,'boss_key','history:80','events',
 (select jsonb_agg(jsonb_build_object('w','hist_boss'||n,'ok',n<>1,'k','recognition','m','quiz') order by n) from generate_series(1,5)n)||'[{"w":"hist_boss1","ok":true,"r":true,"k":"recognition","m":"quiz"}]'::jsonb));
select pg_temp.history_check((select bosses=1 from user_stats where user_id=auth.uid()),'80% recognition-only test passes');
select submit_session(jsonb_build_object('client_id','history-boss-60','mode','boss','finished',true,'boss_key','history:60','events',
 (select jsonb_agg(jsonb_build_object('w','hist_low'||n,'ok',n>2,'k','recognition','m','quiz') order by n) from generate_series(1,5)n)));
select pg_temp.history_check((select bosses=1 from user_stats where user_id=auth.uid()),'below 80% cannot win');
-- Retry success must not turn 5/8 first writing answers into a >=70% writing result.
select submit_session(jsonb_build_object('client_id','history-recall-first','mode','boss','finished',true,'boss_key','history:recall-first','events',
 (select jsonb_agg(jsonb_build_object('w','hist_recall'||n,'ok',n>3,'k',case when n<=8 then 'recall' else 'recognition' end,'m',case when n<=8 then 'audio' else 'quiz' end) order by n) from generate_series(1,15)n)
 ||(select jsonb_agg(jsonb_build_object('w','hist_recall'||n,'ok',true,'r',true,'k','recall','m','audio') order by n) from generate_series(1,3)n)));
select pg_temp.history_check((select bosses=1 from user_stats where user_id=auth.uid()),'writing threshold uses first attempts, not successful retries');
reset role;
select 'PASS history: raw answers, retries, idempotence, teacher/pupil RLS, limits, timestamps, agreed final-test threshold' as result;

