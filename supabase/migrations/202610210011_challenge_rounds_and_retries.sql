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
 if not found or c.word_id is distinct from p_word or c.expires_at<=now() then
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
-- Server creates a distinct pair board or staged encounter; client never supplies the answer key.
create or replace function lexigo.next_challenge(p_actor uuid,p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a lexigo.attempts%rowtype; v_section text; game_mode text;
 idx integer; w lexigo.vocabulary_words%rowtype; other lexigo.vocabulary_words%rowtype;
 ch lexigo.attempt_challenges%rowtype; payload jsonb; expected_answer text;
 flip boolean; challenge_id uuid; phase integer;
begin
 select * into a from lexigo.attempts where id=p_attempt for update;
 if not found or a.pupil_user_id<>p_actor or a.status<>'started'
 or not lexigo.can_see_assignment(a.assignment_id,p_actor) then
  raise exception 'not authorized' using errcode='42501'; end if;
 select assignments.section_id,assignments.mode into v_section,game_mode from lexigo.assignments where id=a.assignment_id;
 if game_mode in ('cards','daily') then raise exception 'self rating only' using errcode='22023'; end if;
 select coalesce(max(event_index),-1)+1 into idx from lexigo.attempt_events where attempt_id=p_attempt;
 if idx>499 then raise exception 'attempt limit' using errcode='22023'; end if;
 select * into ch from lexigo.attempt_challenges where attempt_id=p_attempt and event_index=idx;
 if found then
  if ch.expires_at<=now() then raise exception 'challenge expired' using errcode='42501'; end if;
  return pg_catalog.jsonb_build_object('challengeId',ch.id,'index',idx,
   'wordId',ch.word_id,'mode',ch.mode,'question',ch.payload,
   'hinted',ch.hint_count>0,'retriesUsed',ch.wrong_tries);
 end if;
 select * into w from lexigo.vocabulary_words where vocabulary_words.section_id=v_section
 order by random() limit 1;
 if not found then raise exception 'empty section' using errcode='22023'; end if;
 select * into other from lexigo.vocabulary_words
 where vocabulary_words.section_id=v_section and id<>w.id and ru<>w.ru
 order by random() limit 1;
 flip:=random()<0.5;
 expected_answer:=w.en;
 payload:=pg_catalog.jsonb_build_object('prompt',w.ru,'responseType','text');
 if game_mode='quiz' or game_mode='pairs' then
  if found then
   expected_answer:=w.ru;
   payload:=pg_catalog.jsonb_build_object('prompt',w.en,
    'responseType',case when game_mode='pairs' then 'pair' else 'choice' end,
    'choices',case when flip then pg_catalog.jsonb_build_array(w.ru,other.ru)
    else pg_catalog.jsonb_build_array(other.ru,w.ru) end,
    'instruction',case when game_mode='pairs' then 'Match this English tile to its Russian partner'
    else 'Choose the translation' end);
  end if;
 elsif game_mode='truefalse' then
  payload:=pg_catalog.jsonb_build_object('prompt',w.en,'responseType','boolean',
   'proposed',case when not found or flip then w.ru else other.ru end);
  expected_answer:=case when not found or flip then 'true' else 'false' end;
 elsif game_mode='audio' then
  payload:=pg_catalog.jsonb_build_object('prompt','Listen and type the word',
   'responseType','audio','speechText',w.en);
 elsif game_mode='fix' then
  payload:=pg_catalog.jsonb_build_object('prompt',w.ru,'responseType','text',
   'instruction','Correct the English spelling');
 elsif game_mode='crystals' then
  phase:=idx%3;
  payload:=pg_catalog.jsonb_build_object('prompt',w.ru,'responseType','text',
   'phase',phase,'phaseCount',3,'instruction',
   case phase when 0 then 'Collect: spell the word'
   when 1 then 'Charge: spell the word' else 'Release: spell the word' end);
 elsif game_mode='boss' then
  phase:=idx%3;
  payload:=pg_catalog.jsonb_build_object('prompt',w.ru,'responseType','text',
   'phase',phase,'phaseCount',3,'instruction',
   case phase when 0 then 'Boss round: opening'
   when 1 then 'Boss round: defense' else 'Boss round: finale' end);
 end if;
 insert into lexigo.attempt_challenges(attempt_id,event_index,word_id,mode,payload,expected)
 values(p_attempt,idx,w.id,game_mode,payload,expected_answer) returning id into challenge_id;
 return pg_catalog.jsonb_build_object('challengeId',challenge_id,'index',idx,
  'wordId',w.id,'mode',game_mode,'question',payload,'hinted',false,'retriesUsed',0);
end $$;
revoke all on function lexigo.answer_challenge(uuid,uuid,uuid,integer,text,text),
 lexigo.next_challenge(uuid,uuid) from public,anon,authenticated;
grant execute on function lexigo.answer_challenge(uuid,uuid,uuid,integer,text,text),
 lexigo.next_challenge(uuid,uuid) to service_role;
commit;
