-- Server-owned per-attempt challenges, no client-chosen vocabulary sequence.
begin;
create table lexigo.attempt_challenges(
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null references lexigo.attempts(id) on delete cascade,
 event_index integer not null check(event_index between 0 and 499),
 word_id text not null references lexigo.vocabulary_words(id),
 mode text not null,
 payload jsonb not null,
 expected text not null,
 expires_at timestamptz not null default now()+interval '15 minutes',
 answered_at timestamptz,
 unique(attempt_id,event_index)
);
revoke all on lexigo.attempt_challenges from public,anon,authenticated;
grant all on lexigo.attempt_challenges to service_role;
alter table lexigo.attempt_challenges enable row level security;
-- No client SELECT policies: expected answers and challenge tokens remain private.
create function lexigo.next_challenge(p_actor uuid,p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_attempt lexigo.attempts%rowtype; v_section text; v_mode text;
 v_idx integer; v_word lexigo.vocabulary_words%rowtype; v_other lexigo.vocabulary_words%rowtype;
 v_id uuid; v_payload jsonb; v_expected text; v_ch lexigo.attempt_challenges%rowtype;
 v_flip boolean; v_order integer;
begin
 select * into v_attempt from lexigo.attempts where id=p_attempt for update;
 if not found or v_attempt.pupil_user_id<>p_actor or v_attempt.status<>'started'
 or not lexigo.can_see_assignment(v_attempt.assignment_id,p_actor) then
  raise exception 'not authorized' using errcode='42501'; end if;
 select a.section_id,a.mode into v_section,v_mode from lexigo.assignments a where a.id=v_attempt.assignment_id;
 if v_mode in ('cards','daily') then raise exception 'self rating only' using errcode='22023'; end if;
 select coalesce(max(event_index),-1)+1 into v_idx from lexigo.attempt_events where attempt_id=p_attempt;
 if v_idx>499 then raise exception 'attempt limit' using errcode='22023'; end if;
 select * into v_ch from lexigo.attempt_challenges where attempt_id=p_attempt and event_index=v_idx;
 if found then
  if v_ch.expires_at<=now() then raise exception 'challenge expired' using errcode='42501'; end if;
  return pg_catalog.jsonb_build_object('challengeId',v_ch.id,'index',v_idx,
   'wordId',v_ch.word_id,'mode',v_ch.mode,'question',v_ch.payload);
 end if;
 select * into v_word from lexigo.vocabulary_words where section_id=v_section order by random() limit 1;
 if not found then raise exception 'empty section' using errcode='22023'; end if;
 v_expected:=v_word.en;
 v_payload:=pg_catalog.jsonb_build_object('prompt',v_word.ru,'responseType','text');
 if v_mode='quiz' then
  select * into v_other from lexigo.vocabulary_words where section_id=v_section
   and id<>v_word.id and ru<>v_word.ru order by random() limit 1;
  if found then
   v_flip:=random()<0.5;
   v_payload:=pg_catalog.jsonb_build_object('prompt',v_word.en,'responseType','choice',
    'choices',case when v_flip then pg_catalog.jsonb_build_array(v_word.ru,v_other.ru)
      else pg_catalog.jsonb_build_array(v_other.ru,v_word.ru) end);
   v_expected:=v_word.ru;
  end if;
 elsif v_mode='truefalse' then
  select * into v_other from lexigo.vocabulary_words where section_id=v_section
   and id<>v_word.id and ru<>v_word.ru order by random() limit 1;
  v_flip:=not found or random()<0.5;
  v_payload:=pg_catalog.jsonb_build_object('prompt',v_word.en,'responseType','boolean',
   'proposed',case when v_flip then v_word.ru else v_other.ru end);
  v_expected:=case when v_flip then 'true' else 'false' end;
 elsif v_mode='pairs' then
  select * into v_other from lexigo.vocabulary_words where section_id=v_section
   and id<>v_word.id and ru<>v_word.ru order by random() limit 1;
  if found then
   v_flip:=random()<0.5;
   v_payload:=pg_catalog.jsonb_build_object('prompt',v_word.en,'responseType','choice',
    'choices',case when v_flip then pg_catalog.jsonb_build_array(v_word.ru,v_other.ru)
    else pg_catalog.jsonb_build_array(v_other.ru,v_word.ru) end);
   v_expected:=v_word.ru;
  end if;
 elsif v_mode='fix' then
  v_payload:=pg_catalog.jsonb_build_object('prompt',v_word.ru,
   'responseType','text','instruction','Correct the English spelling');
 elsif v_mode='audio' then
  v_payload:=pg_catalog.jsonb_build_object('prompt','Listen and type the word',
   'responseType','audio','speechText',v_word.en);
 elsif v_mode in ('crystals','boss') then
  v_payload:=pg_catalog.jsonb_build_object('prompt',v_word.ru,
   'responseType','text','instruction','Spell the English word');
 end if;
 insert into lexigo.attempt_challenges(attempt_id,event_index,word_id,mode,payload,expected)
 values(p_attempt,v_idx,v_word.id,v_mode,v_payload,v_expected) returning id into v_id;
 return pg_catalog.jsonb_build_object('challengeId',v_id,'index',v_idx,
 'wordId',v_word.id,'mode',v_mode,'question',v_payload);
end $$;
create function lexigo.answer_challenge(
 p_actor uuid,p_attempt uuid,p_challenge uuid,p_index integer,p_word text,p_answer text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_attempt lexigo.attempts%rowtype; v_ch lexigo.attempt_challenges%rowtype;
 v_event lexigo.attempt_events%rowtype; v_correct boolean; v_digest bytea; v_id uuid;
begin
 select * into v_attempt from lexigo.attempts where id=p_attempt for update;
 if not found or v_attempt.pupil_user_id<>p_actor or v_attempt.status<>'started'
 or not lexigo.can_see_assignment(v_attempt.assignment_id,p_actor) then
  raise exception 'not authorized' using errcode='42501'; end if;
 select * into v_ch from lexigo.attempt_challenges where id=p_challenge
 and attempt_id=p_attempt and event_index=p_index for update;
 if not found or v_ch.word_id is distinct from p_word then
  raise exception 'challenge mismatch' using errcode='42501'; end if;
 if v_ch.expires_at<=now() then raise exception 'challenge expired' using errcode='42501'; end if;
 if p_answer is null or length(p_answer)>250 then raise exception 'invalid answer' using errcode='22023'; end if;
 v_digest:=pg_catalog.sha256(pg_catalog.convert_to(p_answer,'UTF8'));
 v_correct:=lower(btrim(p_answer))=lower(btrim(v_ch.expected));
 select * into v_event from lexigo.attempt_events where attempt_id=p_attempt and event_index=p_index;
 if found then
  if v_event.word_id is distinct from p_word or v_event.answer_digest is distinct from v_digest
   or v_event.verification_source<>'server_evaluated' then
   raise exception 'conflicting replay' using errcode='23505'; end if;
  return pg_catalog.jsonb_build_object('id',v_event.id,'correct',v_event.verified_correct);
 end if;
 if (select coalesce(max(event_index),-1)+1 from lexigo.attempt_events where attempt_id=p_attempt)<>p_index
 then raise exception 'out of order' using errcode='42501'; end if;
 insert into lexigo.attempt_events(attempt_id,word_id,event_index,event_type,correct,
 hinted,retry,verified_correct,verification_source,answer_digest)
 values(p_attempt,p_word,p_index,'answer',v_correct,false,false,v_correct,'server_evaluated',v_digest)
 returning id into v_id;
 update lexigo.attempt_challenges set answered_at=now() where id=p_challenge;
 return pg_catalog.jsonb_build_object('id',v_id,'correct',v_correct);
end $$;
-- Retire predictable, challenge-free grading RPC.
revoke all on function lexigo.append_verified_answer(uuid,uuid,integer,text,text,boolean,boolean)
 from service_role,public,anon,authenticated;
revoke all on function lexigo.next_challenge(uuid,uuid),
 lexigo.answer_challenge(uuid,uuid,uuid,integer,text,text)
 from public,anon,authenticated;
grant execute on function lexigo.next_challenge(uuid,uuid),
 lexigo.answer_challenge(uuid,uuid,uuid,integer,text,text) to service_role;
commit;
