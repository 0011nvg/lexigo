-- Stateful, server-owned interactive rounds for pairs, crystals and boss.
-- All mutations are serialized on the attempt row. No authenticated direct access.
begin;
alter table lexigo.attempt_challenges
 add column private_state jsonb,
 add column hint_uses integer not null default 0 check(hint_uses between 0 and 2),
 add column retry_uses integer not null default 0 check(retry_uses between 0 and 2);
create table lexigo.challenge_actions(
 challenge_id uuid not null references lexigo.attempt_challenges(id) on delete cascade,
 request_id uuid not null,
 actor_id uuid not null,
 fingerprint bytea not null,
 response jsonb not null,
 created_at timestamptz not null default now(),
 primary key(challenge_id,request_id)
);
revoke all on lexigo.challenge_actions from public,anon,authenticated;
grant all on lexigo.challenge_actions to service_role;
alter table lexigo.challenge_actions enable row level security;

-- A match is any horizontal or vertical run of 3+ equal gems in a 4x4 board.
create or replace function lexigo.gem_matches(p_board jsonb)
returns integer[] language plpgsql immutable set search_path='' as $$
declare r integer; c integer; k integer; result integer[]:='{}'; v text;
begin
 if pg_catalog.jsonb_array_length(p_board)<>36 then return result; end if;
 for r in 0..5 loop
  for c in 0..5 loop
   v:=p_board->>(r*6+c);
   if c<=3 and v=p_board->>(r*6+c+1) and v=p_board->>(r*6+c+2) then
    k:=c;
    while k<=5 and p_board->>(r*6+k)=v loop
     if not (r*6+k)=any(result) then result:=pg_catalog.array_append(result,r*6+k); end if;
     k:=k+1;
    end loop;
   end if;
   if r<=3 and v=p_board->>((r+1)*6+c) and v=p_board->>((r+2)*6+c) then
    k:=r;
    while k<=5 and p_board->>(k*6+c)=v loop
     if not (k*6+c)=any(result) then result:=pg_catalog.array_append(result,k*6+c); end if;
     k:=k+1;
    end loop;
   end if;
  end loop;
 end loop;
 return result;
end $$;
create function lexigo.gem_possible(p_board jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare i integer; j integer; candidate jsonb; v text;
begin
 if pg_catalog.jsonb_array_length(p_board)<>36 then return false; end if;
 for i in 0..35 loop
  for j in i+1..35 loop
   if not ((i/6=j/6 and abs(i-j)=1) or abs(i-j)=6) then continue; end if;
   candidate:=p_board;v:=candidate->>i;
   candidate:=pg_catalog.jsonb_set(candidate,ARRAY[i::text],pg_catalog.to_jsonb(candidate->>j));
   candidate:=pg_catalog.jsonb_set(candidate,ARRAY[j::text],pg_catalog.to_jsonb(v));
   if coalesce(pg_catalog.array_length(lexigo.gem_matches(candidate),1),0)>=3 then return true; end if;
  end loop;
 end loop;
 return false;
end $$;
create function lexigo.make_gem_board()
returns jsonb language plpgsql volatile set search_path='' as $$
declare board jsonb; tries integer;
begin
 for tries in 1..250 loop
  select pg_catalog.jsonb_agg(((pg_catalog.floor(random()*6))::integer)::text order by n)
   into board from pg_catalog.generate_series(1,36) n;
  if coalesce(pg_catalog.array_length(lexigo.gem_matches(board),1),0)=0
   and lexigo.gem_possible(board) then return board; end if;
 end loop;
 raise exception 'cannot generate gem board' using errcode='22023';
end $$;

-- An action is an atomic state transition; request IDs are replay-protected.
create function lexigo.play_challenge(
 p_actor uuid,p_attempt uuid,p_challenge uuid,p_request uuid,
 p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a lexigo.attempts%rowtype; ch lexigo.attempt_challenges%rowtype;
 old lexigo.challenge_actions%rowtype; digest bytea; result jsonb;
 state jsonb; board jsonb; temp text; i integer; j integer; k integer;
 matched integer[]; hits integer; moves integer; good boolean; expected text; v_new jsonb; v_col jsonb; v_row integer; v_x integer; v_pos integer; v_chain integer; v_points integer;
 tiles jsonb; t1 jsonb; t2 jsonb; completed jsonb; phase integer;
 lives integer; retry integer; mode text; answer text; event_id uuid;
begin
 if p_request is null or p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
 or p_action not in ('pair','swap','answer','hint','retry')
 or length(p_payload::text)>2048 then
  raise exception 'invalid action' using errcode='22023'; end if;
 select * into a from lexigo.attempts where id=p_attempt for update;
 if not found or a.pupil_user_id<>p_actor or a.status<>'started'
 or not lexigo.can_see_assignment(a.assignment_id,p_actor) then
  raise exception 'not authorized' using errcode='42501'; end if;
 select * into ch from lexigo.attempt_challenges
 where id=p_challenge and attempt_id=p_attempt for update;
 if not found or ch.expires_at<=now()
 or ch.mode not in ('pairs','crystals','boss') then
  raise exception 'challenge unavailable' using errcode='42501'; end if;
 if (select coalesce(max(event_index),-1)+1 from lexigo.attempt_events
 where attempt_id=p_attempt)<>ch.event_index then
  raise exception 'out of sequence' using errcode='42501'; end if;
 digest:=pg_catalog.sha256(pg_catalog.convert_to(p_action||':'||p_payload::text,'UTF8'));
 select * into old from lexigo.challenge_actions
 where challenge_id=p_challenge and request_id=p_request;
 if found then
  if old.actor_id<>p_actor or old.fingerprint<>digest then
   raise exception 'conflicting request replay' using errcode='23505'; end if;
  return old.response;
 end if;
 if ch.answered_at is not null then raise exception 'challenge completed' using errcode='42501'; end if;
 state:=ch.private_state; mode:=ch.mode;
 if state is null then raise exception 'missing server state' using errcode='22023'; end if;
 result:=pg_catalog.jsonb_build_object('complete',false);
 if p_action='hint' then
  if mode='crystals' or ch.hint_uses>=1 then
   raise exception 'hint unavailable' using errcode='42501'; end if;
  update lexigo.attempt_challenges set hint_uses=hint_uses+1 where id=ch.id;
  result:=result||pg_catalog.jsonb_build_object('hint',state->>'hint','hinted',true);
 elsif mode='pairs' then
  if p_action<>'pair' then raise exception 'wrong action' using errcode='22023'; end if;
  tiles:=state->'tiles'; completed:=coalesce(state->'matched','[]'::jsonb);
  if pg_catalog.jsonb_typeof(p_payload->'first')<>'string'
   or pg_catalog.jsonb_typeof(p_payload->'second')<>'string'
   or p_payload->>'first'=p_payload->>'second' then
   raise exception 'invalid tile IDs' using errcode='22023'; end if;
  select value into t1 from pg_catalog.jsonb_array_elements(tiles) value
   where value->>'id'=p_payload->>'first';
  select value into t2 from pg_catalog.jsonb_array_elements(tiles) value
   where value->>'id'=p_payload->>'second';
  if t1 is null or t2 is null or (completed ? (t1->>'id'))
   or (completed ? (t2->>'id')) then
   raise exception 'tile unavailable' using errcode='42501'; end if;
  good:=(t1->>'word'=t2->>'word' and t1->>'side'<>t2->>'side');
  if good then
   completed:=completed||pg_catalog.jsonb_build_array(t1->>'id',t2->>'id');
   state:=pg_catalog.jsonb_set(state,'{matched}',completed);
  end if;
  moves:=coalesce((state->>'moves')::integer,0)+1;
  state:=pg_catalog.jsonb_set(state,'{moves}',pg_catalog.to_jsonb(moves));
  if moves>40 then raise exception 'pair move limit' using errcode='42501'; end if;
  result:=result||pg_catalog.jsonb_build_object('correct',good,'matched',pg_catalog.jsonb_array_length(completed)/2);
  if pg_catalog.jsonb_array_length(completed)=pg_catalog.jsonb_array_length(tiles) then
   result:=result||pg_catalog.jsonb_build_object('complete',true);
  end if;
 elsif mode='crystals' then
  if p_action<>'swap' then raise exception 'wrong action' using errcode='22023'; end if;
  if pg_catalog.jsonb_typeof(p_payload->'from')<>'number'
   or pg_catalog.jsonb_typeof(p_payload->'to')<>'number' then
   raise exception 'invalid swap' using errcode='22023'; end if;
  begin i:=(p_payload->>'from')::integer;j:=(p_payload->>'to')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
   raise exception 'invalid swap' using errcode='22023'; end;
  if i<0 or i>35 or j<0 or j>35
   or not ((i/6=j/6 and abs(i-j)=1) or abs(i-j)=6) then
   raise exception 'nonadjacent swap' using errcode='42501'; end if;
  board:=state->'board';
  temp:=board->>i;
  board:=pg_catalog.jsonb_set(board,ARRAY[i::text],pg_catalog.to_jsonb(board->>j));
  board:=pg_catalog.jsonb_set(board,ARRAY[j::text],pg_catalog.to_jsonb(temp));
  matched:=lexigo.gem_matches(board);
  good:=coalesce(pg_catalog.array_length(matched,1),0)>=3;
  if not good then
   -- Invalid move does not change the board.
   board:=state->'board';
  else
   -- Match-3 cascades: clear runs, apply gravity per column and refill server-side.
   v_chain:=0;v_points:=coalesce((state->>'points')::integer,0);
   while coalesce(pg_catalog.array_length(matched,1),0)>=3 and v_chain<30 loop
    v_chain:=v_chain+1;
    hits:=coalesce((state->>'hits')::integer,0)+pg_catalog.array_length(matched,1);
    state:=pg_catalog.jsonb_set(state,'{hits}',pg_catalog.to_jsonb(hits));
    v_points:=v_points+(case when pg_catalog.array_length(matched,1)=3 then 30
     when pg_catalog.array_length(matched,1)=4 then 60
     when pg_catalog.array_length(matched,1)=5 then 100
     else 100+(pg_catalog.array_length(matched,1)-5)*40 end)*v_chain;
    v_new:=board;
    foreach k in array matched loop
     v_new:=pg_catalog.jsonb_set(v_new,ARRAY[k::text],'null'::jsonb);
    end loop;
    for v_x in 0..5 loop
     v_col:='[]'::jsonb;
     for v_row in reverse 5..0 loop
      if v_new->(v_row*6+v_x)<>'null'::jsonb then
       v_col:=v_col||pg_catalog.jsonb_build_array(v_new->(v_row*6+v_x));
      end if;
     end loop;
     while pg_catalog.jsonb_array_length(v_col)<6 loop
      v_col:=v_col||pg_catalog.jsonb_build_array(((pg_catalog.floor(random()*6))::integer)::text);
     end loop;
     for v_row in 0..5 loop
      v_new:=pg_catalog.jsonb_set(v_new,ARRAY[((5-v_row)*6+v_x)::text],v_col->v_row);
     end loop;
    end loop;
    board:=v_new;matched:=lexigo.gem_matches(board);
   end loop;
   state:=pg_catalog.jsonb_set(state,'{points}',pg_catalog.to_jsonb(v_points));
   if not lexigo.gem_possible(board) then board:=lexigo.make_gem_board(); end if;

  end if;
  moves:=coalesce((state->>'moves')::integer,0)+1;
  state:=pg_catalog.jsonb_set(pg_catalog.jsonb_set(state,'{board}',board),
   '{moves}',pg_catalog.to_jsonb(moves));
  result:=result||pg_catalog.jsonb_build_object('correct',good,'board',board,
   'hits',coalesce((state->>'hits')::integer,0),'points',coalesce((state->>'points')::integer,0),'moves',moves);
  if moves>=7 then
   result:=result||pg_catalog.jsonb_build_object('complete',true);
  end if;
 elsif mode='boss' then
  phase:=coalesce((state->>'phase')::integer,0);
  lives:=coalesce((state->>'lives')::integer,3);
  retry:=coalesce((state->>'retry')::integer,0);
  if p_action='retry' then
   if retry<>1 then raise exception 'retry unavailable' using errcode='42501'; end if;
   state:=pg_catalog.jsonb_set(state,'{retry}','0'::jsonb);
   update lexigo.attempt_challenges set retry_uses=retry_uses+1 where id=ch.id;
   result:=result||pg_catalog.jsonb_build_object('retry',true,'phase',phase);
  elsif p_action='answer' then
   if pg_catalog.jsonb_typeof(p_payload->'answer')<>'string'
    or length(p_payload->>'answer')>250 or retry=1 then
    raise exception 'invalid boss answer' using errcode='22023'; end if;
   answer:=lower(btrim(p_payload->>'answer'));
   expected:=lower(btrim(state->'stages'->phase->>'expected'));
   good:=answer=expected;
   if good then
    phase:=phase+1;
    state:=pg_catalog.jsonb_set(state,'{phase}',pg_catalog.to_jsonb(phase));
    result:=result||pg_catalog.jsonb_build_object('correct',true);
   else
    lives:=lives-1;
    state:=pg_catalog.jsonb_set(state,'{lives}',pg_catalog.to_jsonb(lives));
    state:=pg_catalog.jsonb_set(state,'{retry}','1'::jsonb);
    result:=result||pg_catalog.jsonb_build_object('correct',false);
   end if;
   result:=result||pg_catalog.jsonb_build_object('lives',lives,'phase',phase);
   if good and phase<pg_catalog.jsonb_array_length(state->'stages') then
    result:=result||pg_catalog.jsonb_build_object('nextQuestion',state->'stages'->phase->'question');
   end if;
   if phase>=pg_catalog.jsonb_array_length(state->'stages') or lives<=0 then
    result:=result||pg_catalog.jsonb_build_object('complete',true,'passed',lives>0);
   end if;
  else raise exception 'wrong boss action' using errcode='22023'; end if;
 else raise exception 'unknown mode' using errcode='22023'; end if;
 update lexigo.attempt_challenges set private_state=state where id=ch.id;
 if result->>'complete'='true' then
  insert into lexigo.attempt_events(attempt_id,word_id,event_index,event_type,
   correct,hinted,retry,verified_correct,verification_source,answer_digest)
  values(p_attempt,ch.word_id,ch.event_index,'answer',
   case when mode='pairs' then true when mode='crystals' then
    true else coalesce((state->>'lives')::integer,0)>0 end,
   ch.hint_uses>0,ch.retry_uses>0,
   case when mode='pairs' then true when mode='crystals' then
    coalesce((state->>'hits')::integer,0)>=7 else coalesce((state->>'lives')::integer,0)>0 end,
   'server_evaluated',digest) returning id into event_id;
  update lexigo.attempt_challenges set answered_at=now() where id=ch.id;
  result:=result||pg_catalog.jsonb_build_object('eventId',event_id);
 end if;
 insert into lexigo.challenge_actions(challenge_id,request_id,actor_id,fingerprint,response)
 values(p_challenge,p_request,p_actor,digest,result);
 return result;
end $$;
revoke all on function lexigo.gem_matches(jsonb),
 lexigo.play_challenge(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function lexigo.play_challenge(uuid,uuid,uuid,uuid,text,jsonb) to service_role;
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
  v_payload:=pg_catalog.jsonb_build_object('responseType','crystals','board',v_board,
   'target',7,'maxMoves',7);
  v_state:=pg_catalog.jsonb_build_object('board',v_board,'hits',0,'points',0,'moves',0);
 elsif v_mode='boss' then
  select * into v_other from lexigo.vocabulary_words where section_id=v_section
   and id<>v_word.id order by random() limit 1;
  if not found then raise exception 'boss needs two words' using errcode='22023'; end if;
  v_stages:=pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('expected',v_word.ru,
    'question',pg_catalog.jsonb_build_object('responseType','text',
     'prompt','Translate: '||v_word.en,'stage','quiz')),
   pg_catalog.jsonb_build_object('expected',v_other.en,
    'question',pg_catalog.jsonb_build_object('responseType','text',
     'prompt',v_other.ru,'stage','spell')),
   pg_catalog.jsonb_build_object('expected','true',
    'question',pg_catalog.jsonb_build_object('responseType','boolean',
     'prompt',v_word.en,'proposed',v_word.ru,'stage','truefalse')));
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
create or replace function lexigo.answer_challenge(
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
 if not found or v_ch.mode in ('pairs','crystals','boss') or v_ch.word_id is distinct from p_word then
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
 values(p_attempt,p_word,p_index,'answer',v_correct,(v_ch.hint_count>0),false,v_correct,'server_evaluated',v_digest)
 returning id into v_id;
 update lexigo.attempt_challenges set answered_at=now() where id=p_challenge;
 return pg_catalog.jsonb_build_object('id',v_id,'correct',v_correct);
end $$;
-- Generic hint route cannot bypass stateful mode hint accounting.
create or replace function lexigo.request_challenge_hint(p_actor uuid,p_attempt uuid,p_challenge uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a lexigo.attempts%rowtype; c lexigo.attempt_challenges%rowtype;
begin
 select * into a from lexigo.attempts where id=p_attempt for update;
 if not found or a.pupil_user_id<>p_actor or a.status<>'started'
 or not lexigo.can_see_assignment(a.assignment_id,p_actor) then
  raise exception 'not authorized' using errcode='42501'; end if;
 select * into c from lexigo.attempt_challenges where id=p_challenge
 and attempt_id=p_attempt for update;
 if not found or c.mode in ('pairs','crystals','boss') or c.answered_at is not null
 or c.expires_at<=now() or c.event_index<>(select coalesce(max(event_index),-1)+1
 from lexigo.attempt_events where attempt_id=p_attempt) then
  raise exception 'hint unavailable' using errcode='42501'; end if;
 update lexigo.attempt_challenges set hint_count=1 where id=c.id;
 return pg_catalog.jsonb_build_object('hinted',true,
 'hint','Compare the prompt carefully; check the meaning and spelling.');
end $$;
commit;
