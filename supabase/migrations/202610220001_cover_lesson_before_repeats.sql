-- Integration-only: guarantee lesson coverage before repeated questions.
begin;
create or replace function lexigo.next_challenge(p_actor uuid,p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_attempt lexigo.attempts%rowtype; v_section text; v_mode text;
 v_idx integer; v_word lexigo.vocabulary_words%rowtype; v_other lexigo.vocabulary_words%rowtype;
 v_id uuid; v_payload jsonb; v_expected text; v_ch lexigo.attempt_challenges%rowtype;
 v_flip boolean; v_order integer; v_state jsonb; v_board jsonb; v_tiles jsonb; v_public jsonb;
 v_stages jsonb; v_q jsonb; v_i integer; v_first uuid; v_second uuid;
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
 -- Cover the lesson before starting another practice cycle. Selection remains
 -- server-owned and serialised by the attempt row lock above.
 select w.* into v_word from lexigo.vocabulary_words w where w.section_id=v_section
 order by exists(select 1 from lexigo.attempt_events e
   where e.attempt_id=p_attempt and e.word_id=w.id), random() limit 1;
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
   and id<>v_word.id order by random() limit 1;
  if not found then raise exception 'pairs need two words' using errcode='22023'; end if;
  v_tiles:=pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('id',gen_random_uuid(),'word',v_word.id,'side','en','text',v_word.en),
   pg_catalog.jsonb_build_object('id',gen_random_uuid(),'word',v_word.id,'side','ru','text',v_word.ru),
   pg_catalog.jsonb_build_object('id',gen_random_uuid(),'word',v_other.id,'side','en','text',v_other.en),
   pg_catalog.jsonb_build_object('id',gen_random_uuid(),'word',v_other.id,'side','ru','text',v_other.ru));
  select pg_catalog.jsonb_agg(value order by random()) into v_tiles
   from pg_catalog.jsonb_array_elements(v_tiles) value;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'id',value->>'id','side',value->>'side','text',value->>'text'))
   into v_public from pg_catalog.jsonb_array_elements(v_tiles) value;
  v_payload:=pg_catalog.jsonb_build_object('responseType','pairs','tiles',v_public);
  v_state:=pg_catalog.jsonb_build_object('tiles',v_tiles,'matched','[]'::jsonb,
   'moves',0,'hint',left(v_word.en,1));
 elsif v_mode='fix' then
  v_payload:=pg_catalog.jsonb_build_object('prompt',v_word.ru,
   'responseType','text','instruction','Correct the English spelling');
 elsif v_mode='audio' then
  v_payload:=pg_catalog.jsonb_build_object('prompt','Listen and type the word',
   'responseType','audio','speechText',v_word.en);
 elsif v_mode='crystals' then
  v_board:=lexigo.make_gem_board();
  v_payload:=pg_catalog.jsonb_build_object('responseType','crystals','board',v_board,'prompt',v_word.ru,
   'target',7,'maxMoves',7);
  v_state:=pg_catalog.jsonb_build_object('board',v_board,'hits',0,'points',0,'moves',0);
 elsif v_mode='boss' then
  select * into v_other from lexigo.vocabulary_words where section_id=v_section
   and id<>v_word.id order by random() limit 1;
  if not found then raise exception 'boss needs two words' using errcode='22023'; end if;
  v_flip:=random()<0.5;
  v_stages:=pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('expected',v_word.ru,
    'question',pg_catalog.jsonb_build_object('responseType','text',
     'prompt','Translate: '||v_word.en,'stage','quiz')),
   pg_catalog.jsonb_build_object('expected',v_other.en,
    'question',pg_catalog.jsonb_build_object('responseType','text',
     'prompt',v_other.ru,'stage','spell')),
   pg_catalog.jsonb_build_object('expected',case when v_flip then 'true' else 'false' end,
    'question',pg_catalog.jsonb_build_object('responseType','boolean',
     'prompt',v_word.en,'proposed',case when v_flip then v_word.ru else v_other.ru end,'stage','truefalse')));
  v_payload:=pg_catalog.jsonb_build_object('responseType','boss',
   'lives',3,'stages',3,'question',v_stages->0->'question');
  v_state:=pg_catalog.jsonb_build_object('stages',v_stages,'phase',0,
   'lives',3,'retry',0,'hint',left(v_word.ru,1));

 end if;
 insert into lexigo.attempt_challenges(attempt_id,event_index,word_id,mode,payload,expected)
 values(p_attempt,v_idx,v_word.id,v_mode,v_payload,v_expected) returning id into v_id;
 if v_state is not null then update lexigo.attempt_challenges set private_state=v_state where id=v_id; end if;
 return pg_catalog.jsonb_build_object('challengeId',v_id,'index',v_idx,
 'wordId',v_word.id,'mode',v_mode,'question',v_payload);
end $$;
-- Text answers and retry accounting are owned by migration 011.
-- Stateful pairs/crystals/boss use play_challenge; do not override answer_challenge here.
-- Generic hint route cannot bypass stateful mode hint accounting.

commit;
