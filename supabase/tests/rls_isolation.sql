-- Run only against a disposable local Supabase/Postgres instance AFTER migration.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
-- Rollback means no fixture remains. Do NOT run on production.
begin;
set local row_security=off;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
('00000000-0000-4000-8000-000000000101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage5-teacher-a@example.invalid','',now(),now(),now()),
('00000000-0000-4000-8000-000000000102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage5-teacher-b@example.invalid','',now(),now(),now()),
('00000000-0000-4000-8000-000000000103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage5-pupil-a@example.invalid','',now(),now(),now()),
('00000000-0000-4000-8000-000000000104','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage5-pupil-b@example.invalid','',now(),now(),now()),
('00000000-0000-4000-8000-000000000105','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage5-parent-a@example.invalid','',now(),now(),now()),
('00000000-0000-4000-8000-000000000106','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage5-parent-b@example.invalid','',now(),now(),now());
insert into lexigo.organizations(id,name) values
('10000000-0000-4000-8000-000000000001','Test School A'),
('10000000-0000-4000-8000-000000000002','Test School B');
insert into lexigo.profiles(user_id,organization_id,role,display_name) values
('00000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000001','teacher','Teacher A'),
('00000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000002','teacher','Teacher B'),
('00000000-0000-4000-8000-000000000103','10000000-0000-4000-8000-000000000001','pupil','Pupil A'),
('00000000-0000-4000-8000-000000000104','10000000-0000-4000-8000-000000000002','pupil','Pupil B'),
('00000000-0000-4000-8000-000000000105','10000000-0000-4000-8000-000000000001','parent','Parent A'),
('00000000-0000-4000-8000-000000000106','10000000-0000-4000-8000-000000000002','parent','Parent B');
insert into lexigo.classes(id,organization_id,teacher_user_id,grade,title) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',2,'2A'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000102',2,'2B');
insert into lexigo.enrollments(class_id,pupil_user_id) values
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000103'),
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000104');
insert into lexigo.parent_pupils(parent_user_id,pupil_user_id,verified_by) values
('00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000101'),
('00000000-0000-4000-8000-000000000106','00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000102');
insert into lexigo.vocabulary_sections(id,grade,module,title,order_index) values ('fixture-section',2,'1','Test',0);
insert into lexigo.vocabulary_words(id,section_id,en,ru,order_index) values ('fixture-word','fixture-section','hello','привет',0);
insert into lexigo.assignments(id,class_id,created_by,section_id,mode,due_at,audience_type) values
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','fixture-section','quiz',now()+interval '1 day','class'),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000102','fixture-section','quiz',now()+interval '1 day','class');
insert into lexigo.attempts(id,assignment_id,pupil_user_id,client_session_id) values
('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000103','50000000-0000-4000-8000-000000000001'),
('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000104','50000000-0000-4000-8000-000000000002');
insert into lexigo.attempt_events(attempt_id,word_id,event_index,event_type,correct) values
('40000000-0000-4000-8000-000000000001','fixture-word',0,'answer',true),
('40000000-0000-4000-8000-000000000002','fixture-word',0,'answer',false);
set local row_security=on;
set local role authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
do $$ begin
 if (select count(*) from lexigo.attempts)<>1 then raise exception 'Pupil A sees foreign attempts'; end if;
 if (select count(*) from lexigo.attempt_events)<>1 then raise exception 'Pupil A sees foreign events'; end if;
 if (select count(*) from lexigo.assignments)<>1 then raise exception 'Pupil A sees foreign assignments'; end if;
 if (select count(*) from lexigo.profiles where role='pupil')<>1 then raise exception 'Pupil A sees another pupil profile'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000105',true);
do $$ begin
 if (select count(*) from lexigo.attempts)<>1 then raise exception 'Parent A sees foreign attempt'; end if;
 if (select count(*) from lexigo.assignments)<>1 then raise exception 'Parent A sees foreign assignment'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
do $$ begin
 if (select count(*) from lexigo.attempts)<>1 then raise exception 'Teacher A sees foreign attempt'; end if;
 if (select count(*) from lexigo.classes)<>1 then raise exception 'Teacher A sees foreign class'; end if;
end $$;

-- Unauthorized write must fail even if the attacker supplies another pupil's ID.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
do $$ begin
 begin
  insert into lexigo.attempts(assignment_id,pupil_user_id,client_session_id)
  values('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000104','50000000-0000-4000-8000-000000000003');
  raise exception 'Foreign attempt insert unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end $$;

reset role;
update lexigo.parent_pupils set revoked_at=now() where parent_user_id='00000000-0000-4000-8000-000000000105';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000105',true);
do $$ begin
 if (select count(*) from lexigo.attempts)<>0 then raise exception 'Revoked parent still sees attempts'; end if;
 if (select count(*) from lexigo.assignments)<>0 then raise exception 'Revoked parent still sees assignments'; end if;
end $$;
rollback;
