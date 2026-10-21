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

do $$
declare a uuid; b uuid; e uuid; x uuid; v_count integer;
begin
 -- Assignment and recipients are committed or rolled back as one operation.
 a:=lexigo.create_assignment_atomic(
 '00000000-0000-4000-8000-000000000101',
 '20000000-0000-4000-8000-000000000001','fixture-section','quiz',
 now()+interval '1 day','individual',
 array['00000000-0000-4000-8000-000000000103']::uuid[]);
 if (select count(*) from lexigo.assignment_recipients where assignment_id=a)<>1 then
  raise exception 'Atomic recipients missing'; end if;
 select count(*) into v_count from lexigo.assignments;
 begin
  perform lexigo.create_assignment_atomic(
  '00000000-0000-4000-8000-000000000101',
  '20000000-0000-4000-8000-000000000001','fixture-section','quiz',
  now()+interval '1 day','individual',
  array['00000000-0000-4000-8000-000000000104']::uuid[]);
  raise exception 'Foreign recipient accepted';
 exception when insufficient_privilege then null; end;
 if (select count(*) from lexigo.assignments)<>v_count then
  raise exception 'Failed atomic assignment leaked partial row'; end if;
 begin
  perform lexigo.create_assignment_atomic(
  '00000000-0000-4000-8000-000000000102',
  '20000000-0000-4000-8000-000000000001','fixture-section','quiz',
  now()+interval '1 day','class',array[]::uuid[]);
  raise exception 'Foreign teacher created assignment';
 exception when insufficient_privilege then null; end;

 -- The same session returns the same attempt; cross-assignment reuse is denied.
 a:=lexigo.start_attempt_atomic('00000000-0000-4000-8000-000000000103',
 '30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
 b:=lexigo.start_attempt_atomic('00000000-0000-4000-8000-000000000103',
 '30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
 if a<>b then raise exception 'Session retry created duplicate'; end if;
 begin
  perform lexigo.start_attempt_atomic('00000000-0000-4000-8000-000000000103',
  '30000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001');
  raise exception 'Session reused across assignments';
 exception when unique_violation then null; when insufficient_privilege then null; end;

 -- Event replay is idempotent only if payload matches byte-for-byte.
 e:=lexigo.append_event_atomic('00000000-0000-4000-8000-000000000103',
 a,0,'fixture-word','answer',true,false,false,null);
 x:=lexigo.append_event_atomic('00000000-0000-4000-8000-000000000103',
 a,0,'fixture-word','answer',true,false,false,null);
 if e<>x then raise exception 'Event replay created duplicate'; end if;
 begin
  perform lexigo.append_event_atomic('00000000-0000-4000-8000-000000000103',
  a,0,'fixture-word','answer',false,false,false,null);
  raise exception 'Conflicting event replay accepted';
 exception when unique_violation then null; end;
 begin
  perform lexigo.append_event_atomic('00000000-0000-4000-8000-000000000104',
  a,1,'fixture-word','answer',true,false,false,null);
  raise exception 'Foreign pupil appended event';
 exception when insufficient_privilege then null; end;
 perform lexigo.finish_attempt_atomic('00000000-0000-4000-8000-000000000103',a);
 perform lexigo.finish_attempt_atomic('00000000-0000-4000-8000-000000000103',a);
 begin
  perform lexigo.append_event_atomic('00000000-0000-4000-8000-000000000103',
  a,1,'fixture-word','answer',true,false,false,null);
  raise exception 'Finished attempt accepted event';
 exception when insufficient_privilege then null; end;
end $$;
-- Direct browser roles cannot call trusted server-only RPCs.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
do $$ begin
 begin
  perform lexigo.start_attempt_atomic('00000000-0000-4000-8000-000000000103',
  '30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002');
  raise exception 'Client invoked server-only atomic RPC';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
