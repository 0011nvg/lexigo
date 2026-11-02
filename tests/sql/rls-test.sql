-- LEXIGO cloud schema: access-control and anti-farming tests (run against a scratch database).
-- Every check raises an exception on failure; the last line prints PASS.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false); end $$;
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAIL: %', msg; end if; end $$;

insert into auth.users(id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1','t1@x.test','{"role":"teacher","display_name":"Виктория Г."}'),
 ('00000000-0000-0000-0000-0000000000a2','t2@x.test','{"role":"teacher","display_name":"Другой учитель"}'),
 ('00000000-0000-0000-0000-0000000000b1','s1@x.test','{"role":"student","display_name":"Маша"}'),
 ('00000000-0000-0000-0000-0000000000b2','s2@x.test','{"role":"student","display_name":"Саша <script>"}'),
 ('00000000-0000-0000-0000-0000000000b3','s3@x.test','{"role":"admin","display_name":""}');

select pg_temp.check((select role from profiles where id='00000000-0000-0000-0000-0000000000b3')='student', 'unknown role falls back to student');
select pg_temp.check((select display_name from profiles where id='00000000-0000-0000-0000-0000000000b2')='Саша script', 'markup stripped from names');
select pg_temp.check((select count(*) from user_stats)=5, 'stats rows created');

-- ---------- teacher creates a group, students join by code ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
create temp table ctx(k text primary key, v text);
grant all on ctx to authenticated;
insert into ctx select 'g1', (create_group('5 «А»')).id::text;
insert into ctx select 'code1', join_code from groups where id=(select v::uuid from ctx where k='g1');
select pg_temp.check((select v from ctx where k='code1') ~ '^[A-HJ-NP-Z2-9]{8}$', 'join code format');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into ctx select 'g2', (create_group('Чужая группа')).id::text;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((join_group(lower((select v from ctx where k='code1'))))->>'ok' = 'true', 'student joins with lower-case code');
select pg_temp.check((join_group('ZZZZZZZZ'))->>'ok' = 'false', 'wrong code rejected');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check((join_group((select v from ctx where k='code1')))->>'ok' = 'true', 'second student joins');

-- teacher cannot join, student cannot create groups
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
do $$ begin perform join_group((select v from ctx where k='code1')); raise exception 'FAIL: teacher joined a group'; exception when insufficient_privilege then null; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin perform create_group('hack'); raise exception 'FAIL: student created a group'; exception when insufficient_privilege then null; end $$;

-- ---------- visibility ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) from profiles)=2, 'student sees self + own teacher only (not classmates)');
select pg_temp.check(not exists(select 1 from profiles where id='00000000-0000-0000-0000-0000000000b2'), 'classmate profile hidden');
select pg_temp.check((select count(*) from groups)=1, 'student sees only own group');
select pg_temp.check((select count(*) from group_members)=1, 'student sees only own membership');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) from profiles)=3, 'teacher sees self + 2 students');
select pg_temp.check((select count(*) from group_members)=2, 'teacher sees members of own group');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check((select count(*) from profiles)=1, 'other teacher sees nobody else');
select pg_temp.check((select count(*) from groups)=1, 'other teacher sees only own group');

-- ---------- forbidden direct writes ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin update profiles set role='teacher' where id=auth.uid(); raise exception 'FAIL: role changed'; exception when insufficient_privilege then null; end $$;
update profiles set display_name='Мария' where id=auth.uid();
select pg_temp.check((select display_name from profiles where id=auth.uid())='Мария', 'own name editable');
update profiles set display_name='X' where id='00000000-0000-0000-0000-0000000000b2';
reset role; select pg_temp.check((select display_name from profiles where id='00000000-0000-0000-0000-0000000000b2')<>'X', 'cannot rename others'); set role authenticated;
do $$ begin update user_stats set xp=99999; raise exception 'FAIL: xp edited'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into sessions(user_id,client_id,scope,mode,local_day) values (auth.uid(),'abcdefgh1','other','quiz',current_date); raise exception 'FAIL: direct session insert'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into group_members(group_id,student_id) values ((select v::uuid from ctx where k='g2'), auth.uid()); raise exception 'FAIL: joined group without code'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into custom_lessons(owner_id,title,words) values (auth.uid(),'x','[{"en":"a","ru":"б"},{"en":"c","ru":"д"}]'); raise exception 'FAIL: student created lesson'; exception when insufficient_privilege then null; end $$;

-- ---------- lessons and assignments ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into custom_lessons(owner_id,title,words) values (auth.uid(),'Мой урок','[{"en":"apple","ru":"яблоко"},{"en":"pear","ru":"груша"}]');
insert into ctx select 'l1', id::text from custom_lessons where title='Мой урок';
insert into assignments(group_id,teacher_id,title,grade,section_indexes,modes,comment) values ((select v::uuid from ctx where k='g1'),auth.uid(),'Spotlight 4 · Module 3',4,'{20,21}','{quiz,spell}','До пятницы');
insert into assignments(group_id,teacher_id,student_id,title,lesson_id,modes) values ((select v::uuid from ctx where k='g1'),auth.uid(),'00000000-0000-0000-0000-0000000000b2','Только Саше',(select v::uuid from ctx where k='l1'),'{pairs}');
insert into ctx select 'a1', id::text from assignments where title like 'Spotlight 4%';
insert into ctx select 'a_sasha', id::text from assignments where title='Только Саше';

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
do $$ begin insert into assignments(group_id,teacher_id,title,grade,section_indexes,modes) values ((select v::uuid from ctx where k='g1'),auth.uid(),'чужое',3,'{1}','{quiz}'); raise exception 'FAIL: assignment into foreign group'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into assignments(group_id,teacher_id,title,lesson_id,modes) values ((select v::uuid from ctx where k='g2'),auth.uid(),'чужой урок',(select v::uuid from ctx where k='l1'),'{quiz}'); raise exception 'FAIL: used foreign lesson'; exception when insufficient_privilege then null; end $$;
select pg_temp.check((select count(*) from assignments)=0, 'other teacher sees no foreign assignments');
select pg_temp.check((select count(*) from custom_lessons)=0, 'other teacher sees no foreign lessons');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) from assignments)=1, 'student sees group assignment, not a classmate''s personal one');
select pg_temp.check((select count(*) from custom_lessons)=0, 'student does not see lesson assigned to someone else');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check((select count(*) from assignments)=2, 'addressed student sees both');
select pg_temp.check((select count(*) from custom_lessons)=1, 'addressed student sees the custom lesson words');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select pg_temp.check((select count(*) from assignments)=0, 'outsider sees no assignments');

-- ---------- submit_session: XP from real answers, idempotence, caps ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
create temp table r(k text primary key, v jsonb); grant all on r to authenticated;
insert into r select 's1', submit_session(jsonb_build_object('client_id','sess-0001','mode','quiz','scope','lesson','grade',4,'section_index',20,'route','/lesson/4/20','finished',true,'day',current_date,
  'assignment_id',(select v from ctx where k='a1'),
  'events',jsonb_build_array(jsonb_build_object('w','w100','ok',true),jsonb_build_object('w','w101','ok',true),jsonb_build_object('w','w102','ok',false),jsonb_build_object('w','w102','ok',true,'r',true))));
select pg_temp.check((select (v->>'xp_gained')::int from r where k='s1')=6, 'xp for 3 correct answers = 6');
select pg_temp.check((select v->>'assignment_id' from r where k='s1') = (select v from ctx where k='a1'), 'assignment linked');
select pg_temp.check((select accuracy from sessions where client_id='sess-0001')=67, 'first-try accuracy 2/3');
insert into r select 'dup', submit_session(jsonb_build_object('client_id','sess-0001','mode','quiz','finished',true,'events',jsonb_build_array(jsonb_build_object('w','w100','ok',true))));
select pg_temp.check((select (v->>'duplicate')::boolean and (v->>'xp_gained')::int=0 from r where k='dup'), 'resubmission awards nothing');
select pg_temp.check((select count(*) from sessions where user_id=auth.uid())=1, 'resubmission stores no duplicate');
insert into r select 's2', submit_session(jsonb_build_object('client_id','sess-0002','mode','spell','finished',true,'events',jsonb_build_array(jsonb_build_object('w','w100','ok',true,'k','recall'))));
insert into r select 's3', submit_session(jsonb_build_object('client_id','sess-0003','mode','spell','finished',true,'events',jsonb_build_array(jsonb_build_object('w','w100','ok',true,'k','recall'))));
select pg_temp.check((select (v->>'xp_gained')::int from r where k='s2')=4, 'second award of a word today (recall = 4)');
select pg_temp.check((select (v->>'xp_gained')::int from r where k='s3')=0, 'third answer of the same word today = 0 XP');
select pg_temp.check((select right_count from word_progress where user_id=auth.uid() and word_id='w100')=3, 'word progress counts every correct answer');
select pg_temp.check((select wrong_count from word_progress where user_id=auth.uid() and word_id='w102')=1, 'mistakes recorded');
insert into r select 'self', submit_session(jsonb_build_object('client_id','sess-cards','mode','cards','finished',true,'events',jsonb_build_array(jsonb_build_object('w','w200','ok',true,'k','self'))));
select pg_temp.check((select (v->>'xp_gained')::int from r where k='self')=0, 'card self-rating gives no XP');
-- missions: max three a day, chest once
insert into r select 'm', submit_session(jsonb_build_object('client_id','sess-miss1','mode','quiz','finished',true,'missions','["newwords","recall","listen","perfect","bogus"]'::jsonb,'chest',true,'events','[]'::jsonb));
select pg_temp.check((select (v->>'xp_gained')::int from r where k='m')=115, 'three missions (75) + chest (40); fourth mission ignored');
insert into r select 'm2', submit_session(jsonb_build_object('client_id','sess-miss2','mode','quiz','finished',true,'missions','["newwords","variety"]'::jsonb,'chest',true,'events','[]'::jsonb));
select pg_temp.check((select (v->>'xp_gained')::int from r where k='m2')=0, 'missions and chest not paid twice');
-- boss: verified on the server
insert into r select 'b_bad', submit_session(jsonb_build_object('client_id','sess-boss0','mode','boss','finished',true,'boss_key','4:Module 3','events',jsonb_build_array(
  jsonb_build_object('w','w300','ok',false,'k','recall'),jsonb_build_object('w','w301','ok',true),jsonb_build_object('w','w302','ok',true))));
select pg_temp.check((select (v->>'xp_gained')::int from r where k='b_bad')=4, 'failed boss: no bonus');
insert into r select 'b_ok', submit_session(jsonb_build_object('client_id','sess-boss1','mode','boss','finished',true,'boss_key','4:Module 3','events',jsonb_build_array(
  jsonb_build_object('w','w310','ok',true,'k','recall'),jsonb_build_object('w','w311','ok',true),jsonb_build_object('w','w312','ok',true))));
select pg_temp.check((select (v->>'xp_gained')::int from r where k='b_ok')=58, 'won boss: 8 word XP + 50 bonus');
insert into r select 'b_again', submit_session(jsonb_build_object('client_id','sess-boss2','mode','boss','finished',true,'boss_key','4:Module 3','events',jsonb_build_array(
  jsonb_build_object('w','w320','ok',true,'k','recall'),jsonb_build_object('w','w321','ok',true),jsonb_build_object('w','w322','ok',true))));
select pg_temp.check((select (v->>'xp_gained')::int from r where k='b_again')=8, 'same boss bonus is paid once');
select pg_temp.check((select xp from user_stats where user_id=auth.uid())=6+4+115+4+58+8, 'total XP matches');
select pg_temp.check((select streak_count from user_stats where user_id=auth.uid())=1, 'streak started');
-- foreign assignment cannot be attached
insert into r select 'fa', submit_session(jsonb_build_object('client_id','sess-fa01','mode','pairs','finished',true,'assignment_id',(select v from ctx where k='a_sasha'),'events','[]'::jsonb));
select pg_temp.check((select v->>'assignment_id' from r where k='fa') is null, 'cannot attach result to someone else''s assignment');
-- bad payloads
do $$ begin perform submit_session('{"client_id":"x","mode":"quiz"}'); raise exception 'FAIL: short client id accepted'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end $$;
do $$ begin perform submit_session(jsonb_build_object('client_id','sess-big1','mode','quiz','events',(select jsonb_agg(jsonb_build_object('w','w1','ok',true)) from generate_series(1,700)))); raise exception 'FAIL: oversized events'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end $$;

-- ---------- guest import: once, no XP ----------
insert into r select 'imp', import_guest_progress('{"w900":{"right":3,"wrong":1,"streak":2,"last":1700000000000},"w901":{"right":999},"bad id!":{"right":1}}');
select pg_temp.check((select (v->>'imported')::int from r where k='imp')=2, 'two valid words imported');
select pg_temp.check((select right_count from word_progress where user_id=auth.uid() and word_id='w901')=50, 'imported counters capped');
insert into r select 'imp2', import_guest_progress('{"w902":{"right":3}}');
select pg_temp.check((select (v->>'already')::boolean from r where k='imp2'), 'import only once');

-- ---------- ТОП-3: server-ranked, only own finished sessions, one entry per player ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into r select 'lb1', submit_session(jsonb_build_object('client_id','sess-lb-001','mode','quiz','finished',true,'board_key','quiz|g4s3|n3','seconds',30,
  'events',jsonb_build_array(jsonb_build_object('w','w500','ok',true),jsonb_build_object('w','w501','ok',true),jsonb_build_object('w','w502','ok',false))));
select pg_temp.check((select board_key from sessions where client_id='sess-lb-001')='quiz|g4s3|n3', 'board key stored');
select pg_temp.check((select (leaderboard_preview((select v->>'session_id' from r where k='lb1')::uuid)->>'qualifies')::boolean), 'first result qualifies');
do $$ begin perform leaderboard_claim((select v->>'session_id' from r where k='lb1')::uuid, '<b>'); raise exception 'FAIL: bad name accepted'; exception when invalid_parameter_value then null; end $$;
select pg_temp.check((leaderboard_claim((select v->>'session_id' from r where k='lb1')::uuid, '  Маша   К. '))->>'ok' = 'true', 'claim with a valid name');
select pg_temp.check((select name from leaderboard_top('quiz|g4s3|n3') where place=1)='Маша К.', 'name normalised, place 1');
select pg_temp.check((leaderboard_claim((select v->>'session_id' from r where k='lb1')::uuid, 'Маша'))->>'ok' = 'false', 'same session cannot be claimed twice');
insert into r select 'lb_mode', submit_session(jsonb_build_object('client_id','sess-lb-002','mode','spell','finished',true,'board_key','quiz|g4s3|n3','events',jsonb_build_array(jsonb_build_object('w','w500','ok',true))));
select pg_temp.check((select board_key from sessions where client_id='sess-lb-002') is null, 'board key of another mode rejected');
insert into r select 'lb_fast', submit_session(jsonb_build_object('client_id','sess-lb-003','mode','quiz','finished',true,'board_key','quiz|g4s3|n3','seconds',0.2,'events',jsonb_build_array(jsonb_build_object('w','w500','ok',true),jsonb_build_object('w','w501','ok',true),jsonb_build_object('w','w502','ok',true))));
select pg_temp.check((select seconds from sessions where client_id='sess-lb-003') is null, 'implausible time dropped');
select pg_temp.check((leaderboard_claim((select v->>'session_id' from r where k='lb_fast')::uuid, 'Маша'))->>'ok' = 'true', 'better own result replaces the old one');
select pg_temp.check((select count(*) from leaderboard_top('quiz|g4s3|n3'))=1 and (select accuracy from leaderboard_top('quiz|g4s3|n3'))=100, 'one entry per player, best kept');
-- other students fill the board; the 4th worse result does not qualify
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
insert into r select 'lb_b3', submit_session(jsonb_build_object('client_id','sess-lb-b3a','mode','quiz','finished',true,'board_key','quiz|g4s3|n3','seconds',20,'events',jsonb_build_array(jsonb_build_object('w','w500','ok',true),jsonb_build_object('w','w501','ok',false),jsonb_build_object('w','w502','ok',false))));
select pg_temp.check((leaderboard_claim((select v->>'session_id' from r where k='lb_b3')::uuid, 'Петя'))->>'ok' = 'true', 'second player claims');
select pg_temp.check((select string_agg(name, ',' order by place) from leaderboard_top('quiz|g4s3|n3'))='Маша,Петя', 'ordered by accuracy');
select pg_temp.check(not (select mine from leaderboard_top('quiz|g4s3|n3') where place=1), 'mine flag only for own row');
do $$ begin insert into leaderboard(board_key,user_id,name) values ('quiz|g4s3|n3', auth.uid(), 'Хакер'); raise exception 'FAIL: direct leaderboard insert'; exception when insufficient_privilege then null; end $$;
select pg_temp.check((leaderboard_claim((select id from sessions where client_id='sess-lb-001'), 'Чужой'))->>'ok' = 'false', 'cannot claim someone else''s session');
select pg_temp.check((leaderboard_preview((select id from sessions where client_id='sess-lb-001')))->>'qualifies' is distinct from 'true', 'foreign session is never eligible');
reset role; set role anon; select pg_temp.as_user(null);
select pg_temp.check((select count(*) from leaderboard_top('quiz|g4s3|n3'))=2, 'guests can view the top 3');
reset role; set role authenticated;

-- ---------- teacher reads results only of own students ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select count(*) from sessions where user_id='00000000-0000-0000-0000-0000000000b1')>=5, 'teacher sees own student sessions');
select pg_temp.check((select count(*) from word_progress where user_id='00000000-0000-0000-0000-0000000000b1')>0, 'teacher sees own student word progress');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check((select count(*) from sessions)=0, 'foreign teacher sees no sessions');
select pg_temp.check((select count(*) from user_stats)=1, 'foreign teacher sees only own stats');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check((select count(*) from sessions)=0, 'classmate sees no sessions of others');
select pg_temp.check((select count(*) from user_stats)=1, 'classmate sees only own stats');

-- teacher removes a student: access ends immediately
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
delete from group_members where student_id='00000000-0000-0000-0000-0000000000b1';
select pg_temp.check((select count(*) from sessions where user_id='00000000-0000-0000-0000-0000000000b1')=0, 'removed student data no longer visible');
select pg_temp.check((select v from ctx where k='code1') <> regenerate_join_code((select v::uuid from ctx where k='g1')), 'join code regenerated');

-- ---------- anonymous visitor ----------
reset role; set role anon; select pg_temp.as_user(null);
do $$ begin perform count(*) from profiles; raise exception 'FAIL: anon read profiles'; exception when insufficient_privilege then null; end $$;
do $$ begin perform submit_session('{}'); raise exception 'FAIL: anon submitted'; exception when insufficient_privilege then null; end $$;

-- ---------- delete account cascades ----------
reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
reset role;  -- the local shim's auth.users is owned by postgres, as in Supabase the function runs as owner
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',false);
select delete_my_account();
select pg_temp.check(not exists(select 1 from profiles where id='00000000-0000-0000-0000-0000000000b2'), 'profile deleted');
select pg_temp.check(not exists(select 1 from group_members where student_id='00000000-0000-0000-0000-0000000000b2'), 'memberships deleted');
select pg_temp.check(not exists(select 1 from assignments where student_id='00000000-0000-0000-0000-0000000000b2'), 'personal assignments deleted');

select 'PASS cloud schema: roles, RLS isolation, server-side XP, idempotence, caps, removal, account deletion' as result;
