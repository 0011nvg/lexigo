-- Server-only transactional operations. Never expose these RPCs to browser roles.
begin;
create function lexigo.create_assignment_atomic(
 p_actor uuid,p_class uuid,p_section text,p_mode text,p_due timestamptz,
 p_audience lexigo.audience_kind,p_recipients uuid[] default array[]::uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_count integer;
begin
 if not lexigo.is_teacher_of(p_class,p_actor) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 if p_due is null or p_due<=now() or p_mode not in
 ('daily','cards','quiz','spell','pairs','truefalse','fix','audio','crystals','boss') then
  raise exception 'invalid assignment' using errcode='22023';
 end if;
 if not exists(select 1 from lexigo.classes c join lexigo.vocabulary_sections s
 on s.grade=c.grade where c.id=p_class and s.id=p_section) then
  raise exception 'invalid section' using errcode='22023';
 end if;
 if p_audience='class' and coalesce(cardinality(p_recipients),0)<>0 then
  raise exception 'class assignment cannot have recipients' using errcode='22023';
 end if;
 if p_audience='individual' then
  if coalesce(cardinality(p_recipients),0)<1 or cardinality(p_recipients)>100
   or (select count(distinct u) from unnest(p_recipients) u)<>cardinality(p_recipients) then
   raise exception 'invalid recipients' using errcode='22023';
  end if;
  select count(*) into v_count from unnest(p_recipients) u
  where lexigo.is_active_pupil(p_class,u);
  if v_count<>cardinality(p_recipients) then
   raise exception 'recipient not enrolled' using errcode='42501';
  end if;
 end if;
 insert into lexigo.assignments(class_id,created_by,section_id,mode,due_at,audience_type)
 values(p_class,p_actor,p_section,p_mode,p_due,p_audience) returning id into v_id;
 if p_audience='individual' then
  insert into lexigo.assignment_recipients(assignment_id,pupil_user_id)
  select v_id,u from unnest(p_recipients) u;
 end if;
 insert into lexigo.audit_log(actor_user_id,action,subject_type,subject_id)
 values(p_actor,'assignment.created','assignment',v_id);
 return v_id;
end $$;

create function lexigo.start_attempt_atomic(p_actor uuid,p_assignment uuid,p_session uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if p_actor is null or p_session is null
 or not lexigo.can_see_assignment(p_assignment,p_actor) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 insert into lexigo.attempts(assignment_id,pupil_user_id,client_session_id)
 values(p_assignment,p_actor,p_session)
 on conflict(pupil_user_id,client_session_id) do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from lexigo.attempts
  where pupil_user_id=p_actor and client_session_id=p_session
  and assignment_id=p_assignment;
 end if;
 if v_id is null then
  raise exception 'session conflict' using errcode='23505';
 end if;
 return v_id;
end $$;

create function lexigo.append_event_atomic(
 p_actor uuid,p_attempt uuid,p_index integer,p_word text,
 p_kind lexigo.event_kind,p_correct boolean,p_hinted boolean,p_retry boolean,
 p_rating text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_attempt lexigo.attempts%rowtype; v_id uuid; v_event lexigo.attempt_events%rowtype;
begin
 select * into v_attempt from lexigo.attempts where id=p_attempt for update;
 if not found or v_attempt.pupil_user_id<>p_actor or v_attempt.status<>'started'
 or not lexigo.can_see_assignment(v_attempt.assignment_id,p_actor) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 if p_index is null or p_index<0 or p_index>499
 or p_kind is null or p_hinted is null or p_retry is null
 or not exists(select 1 from lexigo.assignments a join lexigo.vocabulary_words w
 on w.section_id=a.section_id where a.id=v_attempt.assignment_id and w.id=p_word) then
  raise exception 'invalid event' using errcode='22023';
 end if;
 if (p_kind='answer' and (p_correct is null or p_rating is not null))
 or (p_kind='card_self_rating' and (p_correct is not null or p_rating not in ('known','unknown'))) then
  raise exception 'invalid event payload' using errcode='22023';
 end if;
 insert into lexigo.attempt_events(attempt_id,word_id,event_index,event_type,correct,hinted,retry,self_rating)
 values(p_attempt,p_word,p_index,p_kind,p_correct,p_hinted,p_retry,p_rating)
 on conflict(attempt_id,event_index) do nothing returning id into v_id;
 if v_id is null then
  select * into v_event from lexigo.attempt_events where attempt_id=p_attempt and event_index=p_index;
  if v_event.word_id is distinct from p_word or v_event.event_type is distinct from p_kind
   or v_event.correct is distinct from p_correct or v_event.hinted is distinct from p_hinted
   or v_event.retry is distinct from p_retry or v_event.self_rating is distinct from p_rating then
   raise exception 'event idempotency conflict' using errcode='23505';
  end if;
  v_id:=v_event.id;
 end if;
 return v_id;
end $$;

create function lexigo.finish_attempt_atomic(p_actor uuid,p_attempt uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_attempt lexigo.attempts%rowtype;
begin
 select * into v_attempt from lexigo.attempts where id=p_attempt for update;
 if not found or v_attempt.pupil_user_id<>p_actor
 or not lexigo.can_see_assignment(v_attempt.assignment_id,p_actor) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 if v_attempt.status='started' then
  update lexigo.attempts set status='finished',finished_at=now() where id=p_attempt;
 end if;
 return p_attempt;
end $$;
revoke all on function lexigo.create_assignment_atomic(uuid,uuid,text,text,timestamptz,lexigo.audience_kind,uuid[]),
 lexigo.start_attempt_atomic(uuid,uuid,uuid),
 lexigo.append_event_atomic(uuid,uuid,integer,text,lexigo.event_kind,boolean,boolean,boolean,text),
 lexigo.finish_attempt_atomic(uuid,uuid) from public,anon,authenticated;
grant execute on function lexigo.create_assignment_atomic(uuid,uuid,text,text,timestamptz,lexigo.audience_kind,uuid[]),
 lexigo.start_attempt_atomic(uuid,uuid,uuid),
 lexigo.append_event_atomic(uuid,uuid,integer,text,lexigo.event_kind,boolean,boolean,boolean,text),
 lexigo.finish_attempt_atomic(uuid,uuid) to service_role;
commit;
