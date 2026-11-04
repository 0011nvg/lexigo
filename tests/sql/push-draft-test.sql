-- Disposable database only. Apply the draft migration in this same psql session
-- after SET lexi.push_isolated_test_only = 'YES'. No production data.
\set ON_ERROR_STOP 1
create or replace function pg_temp.check_push(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'FAIL: %',msg; end if; end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('30000000-0000-0000-0000-000000000001','pushteacher@example.test','{"role":"teacher"}'),
 ('30000000-0000-0000-0000-000000000002','pushstudent1@example.test','{"role":"student"}'),
 ('30000000-0000-0000-0000-000000000003','pushstudent2@example.test','{"role":"student"}');
insert into public.groups(id,teacher_id,name,join_code) values ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Test','ABCDEFGH');
insert into public.group_members(group_id,student_id) values
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002'),
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003');
insert into public.assignments(id,group_id,teacher_id,student_id,title,grade,section_indexes,modes) values
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','Test',3,'{1}','{quiz}');
select pg_temp.check_push(not has_table_privilege('authenticated','public.push_subscriptions','SELECT'),'secrets hidden from clients');
select pg_temp.check_push(not has_function_privilege('authenticated','public.push_assignment_recipients(uuid)','EXECUTE'),'recipient lookup not client callable');
select pg_temp.check_push(not has_function_privilege('anon','public.push_assignment_recipients(uuid)','EXECUTE'),'recipient lookup not guest callable');
set role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',false);
select public.push_save_subscription(auth.uid(),'60000000-0000-0000-0000-000000000001','https://fcm.googleapis.com/fcm/send/test1',repeat('a',87),repeat('b',22));
select public.push_save_preferences(auth.uid(),true,false,'19:00');
select pg_temp.check_push((public.push_my_settings(auth.uid(),'60000000-0000-0000-0000-000000000001')->>'device_subscribed')::boolean,'own device status');
do $$ begin
 perform public.push_save_preferences(auth.uid(),true,true,'19:00');
 raise exception 'FAIL: unsafe daily reminders enabled';
exception when object_not_in_prerequisite_state then null; end $$;
do $$ begin
 perform public.push_save_subscription(auth.uid(),'60000000-0000-0000-0000-000000000002','http://127.0.0.1/admin',repeat('a',87),repeat('b',22));
 raise exception 'FAIL: disallowed endpoint';
exception when check_violation then null; end $$;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000003',false);
select public.push_save_subscription(auth.uid(),'60000000-0000-0000-0000-000000000002','https://fcm.googleapis.com/fcm/send/test2',repeat('a',87),repeat('b',22));
select public.push_save_preferences(auth.uid(),true,false,'19:00');
do $$ begin
 perform public.push_remove_subscription('30000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001');
 raise exception 'FAIL: another account subscription removed';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.check_push((select count(*) from public.push_assignment_recipients('50000000-0000-0000-0000-000000000001'))=1,'only assigned student receives candidate');
select pg_temp.check_push((select user_id from public.push_assignment_recipients('50000000-0000-0000-0000-000000000001'))='30000000-0000-0000-0000-000000000002','candidate identity');
delete from auth.users where id='30000000-0000-0000-0000-000000000002';
select pg_temp.check_push(not exists(select 1 from public.push_subscriptions where user_id='30000000-0000-0000-0000-000000000002'),'subscription cascade');
select pg_temp.check_push(not exists(select 1 from public.push_preferences where user_id='30000000-0000-0000-0000-000000000002'),'preferences cascade');
select 'push draft: PASS';
