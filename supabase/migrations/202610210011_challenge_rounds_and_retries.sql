-- Stage 5: server-authoritative retry accounting, pair board and staged boss/crystal rounds.
-- Synthetic/local only. No changes to the immutable vocabulary.
begin;
alter table lexigo.attempt_challenges
 add column if not exists wrong_tries integer not null default 0 check(wrong_tries between 0 and 2);
alter table lexigo.attempt_challenges
 add column if not exists last_answer_digest bytea;
-- Each challenge has at most two incorrect submissions before a final answer event.
-- Row locks serialize competing requests, including hints and retries.
create or replace function lexigo.answer_challenge(
 p_actor uuid,p_attempt uuid,p_challenge uuid,p_index integer,p_word text,p_answer text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a lexigo.attempts%rowtype; c lexigo.attempt_challenges%rowtype;
 e lexigo.attempt_events%rowtype; correct_answer boolean; digest bytea; new_id uuid;
 attempt_number integer; final_answer boolean;
begin
 select * into a from lexigo.attempts where id=p_attempt for update;
 if not found or a.pupil_user_id<>p_actor or a.status<>'started'
 or not lexigo.can_see_assignment(a.assignment_id,p_actor) then
  raise exception 'not authorized' using errcode='42501'; end if;
 select * into c from lexigo.attempt_challenges
 where id=p_challenge and attempt_id=p_attempt and event_index=p_index for update;
 if not found or c.mode in ('pairs','crystals','boss') or c.word_id is distinct from p_word or c.expires_at<=now() then
  raise exception 'challenge mismatch' using errcode='42501'; end if;
 if p_answer is null or length(p_answer)>250 then
  raise exception 'invalid answer' using errcode='22023'; end if;
 digest:=pg_catalog.sha256(pg_catalog.convert_to(p_answer,'UTF8'));
 select * into e from lexigo.attempt_events
 where attempt_id=p_attempt and event_index=p_index;
 if found then
  if e.word_id is distinct from p_word or e.answer_digest is distinct from digest
   or e.verification_source<>'server_evaluated' then
   raise exception 'conflicting replay' using errcode='23505'; end if;
  return pg_catalog.jsonb_build_object('id',e.id,'correct',e.verified_correct,
   'complete',true,'retry',e.retry,'hinted',e.hinted);
 end if;
 if (select coalesce(max(event_index),-1)+1 from lexigo.attempt_events
 where attempt_id=p_attempt)<>p_index then
  raise exception 'out of order' using errcode='42501'; end if;
 -- A retry of the exact same wrong answer must not consume another try.
 if c.last_answer_digest is not distinct from digest then
  return pg_catalog.jsonb_build_object('correct',false,'complete',false,
   'retry',true,'hinted',c.hint_count>0,'remaining',2-c.wrong_tries);
 end if;
 correct_answer:=lower(btrim(p_answer))=lower(btrim(c.expected));
 attempt_number:=c.wrong_tries;
 final_answer:=correct_answer or attempt_number>=2;
 if not final_answer then
  update lexigo.attempt_challenges set wrong_tries=wrong_tries+1,
   last_answer_digest=digest where id=c.id;
  return pg_catalog.jsonb_build_object('correct',false,'complete',false,
   'retry',true,'hinted',c.hint_count>0,'remaining',1-attempt_number);
 end if;
 insert into lexigo.attempt_events(attempt_id,word_id,event_index,event_type,correct,
 hinted,retry,verified_correct,verification_source,answer_digest)
 values(p_attempt,p_word,p_index,'answer',correct_answer,c.hint_count>0,
 attempt_number>0,correct_answer,'server_evaluated',digest)
 returning id into new_id;
 update lexigo.attempt_challenges set answered_at=now(),last_answer_digest=digest
 where id=c.id;
 return pg_catalog.jsonb_build_object('id',new_id,'correct',correct_answer,
 'complete',true,'retry',attempt_number>0,'hinted',c.hint_count>0,'remaining',0);
end $$;
revoke all on function lexigo.answer_challenge(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function lexigo.answer_challenge(uuid,uuid,uuid,integer,text,text) to service_role;
commit;
