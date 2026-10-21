-- Verified answer pathway. Only a trusted Edge function may call these service-only RPCs.
-- Word selection is deterministic per attempt and event_index; the browser cannot choose
-- a different word to improve its score. Client-reported correct is never trusted.
begin;
create function lexigo.append_verified_answer(
 p_actor uuid,p_attempt uuid,p_index integer,p_word text,p_answer text,
 p_hinted boolean,p_retry boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_attempt lexigo.attempts%rowtype;
 v_mode text; v_section text; v_expected text; v_en text; v_ru text;
 v_count integer; v_id uuid; v_event lexigo.attempt_events%rowtype;
 v_correct boolean; v_answer text;
begin
 select * into v_attempt from lexigo.attempts where id=p_attempt for update;
 if not found or v_attempt.pupil_user_id<>p_actor or v_attempt.status<>'started'
 or not lexigo.can_see_assignment(v_attempt.assignment_id,p_actor) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 select a.mode,a.section_id into v_mode,v_section from lexigo.assignments a
 where a.id=v_attempt.assignment_id;
 if v_mode not in ('quiz','spell','pairs','truefalse','fix','audio','crystals','boss')
 or p_index is null or p_index<0 or p_index>499
 or p_answer is null or length(p_answer)>250
 or p_hinted is null or p_retry is null then
  raise exception 'invalid verified answer' using errcode='22023';
 end if;
 select count(*) into v_count from lexigo.vocabulary_words where section_id=v_section;
 if v_count=0 then raise exception 'empty vocabulary' using errcode='22023'; end if;
 select w.id,w.en,w.ru into v_expected,v_en,v_ru
 from lexigo.vocabulary_words w where w.section_id=v_section
 order by w.order_index,w.id offset (p_index % v_count) limit 1;
 if p_word is distinct from v_expected then
  raise exception 'unexpected word' using errcode='42501';
 end if;
 -- Require exact canonical answer after whitespace/case normalization.
 -- This is a constrained text-answer protocol, not a claim that arbitrary
 -- browser-only multiple-choice or matching interactions were observed.
 v_answer:=lower(btrim(p_answer));
 v_correct:=v_answer=lower(btrim(v_en)) or v_answer=lower(btrim(v_ru));
 insert into lexigo.attempt_events(attempt_id,word_id,event_index,event_type,correct,
  hinted,retry,self_rating,verified_correct,verification_source)
 values(p_attempt,v_expected,p_index,'answer',v_correct,p_hinted,p_retry,null,
  v_correct,'server_evaluated')
 on conflict(attempt_id,event_index) do nothing returning id into v_id;
 if v_id is null then
  select * into v_event from lexigo.attempt_events
  where attempt_id=p_attempt and event_index=p_index;
  if v_event.word_id is distinct from v_expected or v_event.event_type<>'answer'
   or v_event.correct is distinct from v_correct
   or v_event.hinted is distinct from p_hinted or v_event.retry is distinct from p_retry
   or v_event.verification_source<>'server_evaluated' then
   raise exception 'event idempotency conflict' using errcode='23505';
  end if;
  -- Replaying a different answer with the same correctness must also be rejected.
  -- The hash is stored in a separate private column; no plaintext answer is persisted.
  if v_event.answer_digest is distinct from
   pg_catalog.sha256(pg_catalog.convert_to(p_answer,'UTF8')) then
   raise exception 'event idempotency conflict' using errcode='23505';
  end if;
  v_id:=v_event.id;
 else
  update lexigo.attempt_events set
   answer_digest=pg_catalog.sha256(pg_catalog.convert_to(p_answer,'UTF8'))
   where id=v_id;
 end if;
 return v_id;
end $$;
alter table lexigo.attempt_events add column answer_digest bytea;
-- Legacy client-correct pathway may only create self-rating events.
create or replace function lexigo.append_event_atomic(
 p_actor uuid,p_attempt uuid,p_index integer,p_word text,
 p_kind lexigo.event_kind,p_correct boolean,p_hinted boolean,p_retry boolean,
 p_rating text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_attempt lexigo.attempts%rowtype; v_id uuid; v_event lexigo.attempt_events%rowtype;
 v_mode text; v_section text; v_count integer; v_expected text;
begin
 select * into v_attempt from lexigo.attempts where id=p_attempt for update;
 if not found or v_attempt.pupil_user_id<>p_actor or v_attempt.status<>'started'
 or not lexigo.can_see_assignment(v_attempt.assignment_id,p_actor) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 select a.mode,a.section_id into v_mode,v_section from lexigo.assignments a where a.id=v_attempt.assignment_id;
 if v_mode not in ('cards','daily') or p_kind<>'card_self_rating'
 or p_correct is not null or p_rating not in ('known','unknown')
 or p_index is null or p_index<0 or p_index>499 or p_hinted is null or p_retry is null then
  raise exception 'only self-rating allowed' using errcode='22023';
 end if;
 select count(*) into v_count from lexigo.vocabulary_words where section_id=v_section;
 if v_count=0 then raise exception 'empty vocabulary' using errcode='22023'; end if;
 select id into v_expected from lexigo.vocabulary_words where section_id=v_section
 order by order_index,id offset (p_index % v_count) limit 1;
 if p_word is distinct from v_expected then raise exception 'unexpected word' using errcode='42501'; end if;
 insert into lexigo.attempt_events(attempt_id,word_id,event_index,event_type,correct,hinted,retry,self_rating)
 values(p_attempt,v_expected,p_index,p_kind,null,p_hinted,p_retry,p_rating)
 on conflict(attempt_id,event_index) do nothing returning id into v_id;
 if v_id is null then
  select * into v_event from lexigo.attempt_events where attempt_id=p_attempt and event_index=p_index;
  if v_event.word_id is distinct from v_expected or v_event.event_type<>'card_self_rating'
  or v_event.hinted is distinct from p_hinted or v_event.retry is distinct from p_retry
  or v_event.self_rating is distinct from p_rating then
   raise exception 'event idempotency conflict' using errcode='23505';
  end if;
  v_id:=v_event.id;
 end if;
 return v_id;
end $$;
revoke all on function lexigo.append_verified_answer(uuid,uuid,integer,text,text,boolean,boolean)
 from public,anon,authenticated;
grant execute on function lexigo.append_verified_answer(uuid,uuid,integer,text,text,boolean,boolean) to service_role;
commit;
