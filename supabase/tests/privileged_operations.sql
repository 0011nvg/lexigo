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

-- All fixtures and mutations are rolled back; no real users.
-- Exercise privileged functions as the migration owner, standing in for a trusted server.
do $$
declare token1 text; token2 text; token3 text; invite_id uuid; review_id uuid;
begin
 -- Cross-class teacher cannot issue an invitation.
 begin
  perform lexigo.issue_invitation('00000000-0000-4000-8000-000000000102','20000000-0000-4000-8000-000000000001','pupil',24);
  raise exception 'Teacher B issued invite for class A';
 exception when insufficient_privilege then null; end;

 token1:=lexigo.issue_invitation('00000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000001','pupil',24);
 if length(token1)<>64 then raise exception 'Token length incorrect'; end if;
 if exists(select 1 from lexigo.invitations where token_digest=pg_catalog.convert_to(token1,'UTF8')) then
  raise exception 'Raw token was stored';
 end if;
 invite_id:=lexigo.redeem_invitation('00000000-0000-4000-8000-000000000103',token1);
 if not exists(select 1 from lexigo.invitations where id=invite_id and redeemed_at is not null) then
  raise exception 'Invitation not marked as used'; end if;
 begin
  perform lexigo.redeem_invitation('00000000-0000-4000-8000-000000000103',token1);
  raise exception 'Token replay succeeded';
 exception when insufficient_privilege then null; end;

 token2:=lexigo.issue_invitation('00000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000001','pupil',24);
 select id into invite_id from lexigo.invitations
 where token_digest=pg_catalog.sha256(pg_catalog.convert_to(token2,'UTF8'));
 perform lexigo.revoke_invitation('00000000-0000-4000-8000-000000000101',invite_id);
 begin
  perform lexigo.redeem_invitation('00000000-0000-4000-8000-000000000103',token2);
  raise exception 'Revoked invitation accepted';
 exception when insufficient_privilege then null; end;

 token3:=lexigo.issue_invitation('00000000-0000-4000-8000-000000000101','20000000-0000-4000-8000-000000000001','parent',24);
 begin
  perform lexigo.redeem_invitation('00000000-0000-4000-8000-000000000103',token3);
  raise exception 'Pupil redeemed parent invitation';
 exception when insufficient_privilege then null; end;
 perform lexigo.redeem_invitation('00000000-0000-4000-8000-000000000105',token3);

 -- Expired token is rejected.
 insert into lexigo.invitations(class_id,target_role,token_digest,created_by,created_at,expires_at)
 values('20000000-0000-4000-8000-000000000001','pupil',
 pg_catalog.sha256(pg_catalog.convert_to(repeat('a',64),'UTF8')),
 '00000000-0000-4000-8000-000000000101',now()-interval '2 days',now()-interval '1 day');
 begin
  perform lexigo.redeem_invitation('00000000-0000-4000-8000-000000000103',repeat('a',64));
  raise exception 'Expired invitation accepted';
 exception when insufficient_privilege then null; end;

 -- Parent links require teacher authority and can be revoked.
 begin
  perform lexigo.verify_parent_link('00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000103');
  raise exception 'Foreign teacher verified parent';
 exception when insufficient_privilege then null; end;
 perform lexigo.revoke_parent_link('00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000103');
 if lexigo.is_parent_of('00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000103') then
  raise exception 'Revoked parent still has access'; end if;
 perform lexigo.verify_parent_link('00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000103');
 if not lexigo.is_parent_of('00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000103') then
  raise exception 'Parent link was not restored'; end if;

 -- Teacher may review a completed attempt in own class, never a foreign or unfinished one.
 begin
  perform lexigo.review_attempt('00000000-0000-4000-8000-000000000101','40000000-0000-4000-8000-000000000001');
  raise exception 'Unfinished attempt was reviewed';
 exception when insufficient_privilege then null; end;
 update lexigo.attempts set status='finished',finished_at=now()
 where id='40000000-0000-4000-8000-000000000001';
 begin
  perform lexigo.review_attempt('00000000-0000-4000-8000-000000000102','40000000-0000-4000-8000-000000000001');
  raise exception 'Foreign teacher reviewed attempt';
 exception when insufficient_privilege then null; end;
 review_id:=lexigo.review_attempt('00000000-0000-4000-8000-000000000101','40000000-0000-4000-8000-000000000001');
 if not exists(select 1 from lexigo.teacher_reviews where id=review_id and revoked_at is null) then
  raise exception 'Review not persisted'; end if;
 begin
  perform lexigo.revoke_teacher_review('00000000-0000-4000-8000-000000000102',
   '40000000-0000-4000-8000-000000000001');
  raise exception 'Foreign teacher revoked review';
 exception when insufficient_privilege then null; end;
 perform lexigo.revoke_teacher_review('00000000-0000-4000-8000-000000000101',
  '40000000-0000-4000-8000-000000000001');
 if not exists(select 1 from lexigo.teacher_reviews where id=review_id and revoked_at is not null) then
  raise exception 'Review revocation not persisted'; end if;

 -- A redeemed invitation cannot be replayed to restore access after enrollment revocation.
 begin
  perform lexigo.revoke_enrollment('00000000-0000-4000-8000-000000000102',
   '20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000103');
  raise exception 'Foreign teacher revoked enrollment';
 exception when insufficient_privilege then null; end;
 perform lexigo.revoke_enrollment('00000000-0000-4000-8000-000000000101',
  '20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000103');
 if lexigo.is_active_pupil('20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000103') then
  raise exception 'Revoked enrollment still active'; end if;
 if lexigo.can_see_assignment('30000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000103') then
  raise exception 'Revoked pupil still sees assignment'; end if;
 if exists(select 1 from lexigo.invitations where class_id='20000000-0000-4000-8000-000000000001'
  and target_role='pupil' and redeemed_at is null and revoked_at is null) then
  raise exception 'Outstanding class pupil invitation survived revocation'; end if;
end $;

-- A client cannot call privileged invitation/review functions or write audit records.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
do $$ begin
 begin
  perform lexigo.issue_invitation('00000000-0000-4000-8000-000000000101',
   '20000000-0000-4000-8000-000000000001','pupil',24);
  raise exception 'Client executed privileged invitation function';
 exception when insufficient_privilege then null; end;
 begin
  insert into lexigo.teacher_reviews(attempt_id,teacher_user_id)
  values('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101');
  raise exception 'Pupil forged teacher review';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
