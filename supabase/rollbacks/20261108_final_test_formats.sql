-- Restores the previous submit_session definition; stored results remain intact.
BEGIN;
create or replace function public.submit_session(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_client text := p->>'client_id';
  v_day date;
  v_mode text := coalesce(p->>'mode','');
  v_events jsonb := coalesce(p->'events','[]'::jsonb);
  v_assignment uuid; v_lesson uuid; v_scope text := coalesce(p->>'scope','other');
  v_grade int; v_section int; v_route text := nullif(p->>'route',''); v_title text := left(nullif(p->>'title',''), 120);
  v_finished boolean := coalesce((p->>'finished')::boolean, false);
  e jsonb; w text; ok boolean; skill text; retry boolean; hinted boolean;
  v_correct int := 0; v_wrong int := 0; v_hints int := 0; v_first int := 0; v_first_ok int := 0;
  v_recall_total int := 0; v_recall_ok int := 0; v_total int := 0;
  v_xp int := 0; n int; gain int; c text; v_claims int; v_acc int; v_sid uuid;
  st public.user_stats; snap jsonb; existing public.sessions;
  allowed_claims text[] := array['newwords','recall','fixed','due','listen','perfect','variety'];
  v_board text := nullif(p->>'board_key',''); v_seconds numeric; v_mistakes int;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if v_client is null or v_client !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'bad client id'; end if;
  select * into existing from public.sessions where user_id = uid and client_id = v_client;
  if found then
    select * into st from public.user_stats where user_id = uid;
    return jsonb_build_object('duplicate', true, 'session_id', existing.id, 'xp_gained', 0, 'xp', coalesce(st.xp,0), 'streak', coalesce(st.streak_count,0));
  end if;
  if jsonb_typeof(v_events) <> 'array' or jsonb_array_length(v_events) > 600 then raise exception 'bad events'; end if;
  if v_mode !~ '^[a-z]{2,12}$' then raise exception 'bad mode'; end if;
  if (select count(*) from public.sessions where user_id = uid and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many sessions, slow down' using errcode = '54000';
  end if;
  -- местная дата ученика: допускаем расхождение часовых поясов ±1 день
  begin v_day := (p->>'day')::date; exception when others then v_day := current_date; end;
  if v_day is null or v_day < current_date - 1 or v_day > current_date + 1 then v_day := current_date; end if;
  if v_scope not in ('lesson','module','book','custom','assignment','other') then v_scope := 'other'; end if;
  if v_route is not null and v_route !~ '^/lesson/[0-9]{1,2}/m?[0-9]{1,3}$' then v_route := null; end if;
  begin v_grade := (p->>'grade')::int; exception when others then v_grade := null; end;
  if v_grade is not null and (v_grade < 2 or v_grade > 11) then v_grade := null; end if;
  begin v_section := (p->>'section_index')::int; exception when others then v_section := null; end;
  if v_section is not null and (v_section < 0 or v_section > 999) then v_section := null; end if;
  begin v_assignment := (p->>'assignment_id')::uuid; exception when others then v_assignment := null; end;
  if v_assignment is not null and not public.can_see_assignment(v_assignment) then v_assignment := null; end if;
  begin v_lesson := (p->>'lesson_id')::uuid; exception when others then v_lesson := null; end;
  if v_lesson is not null and not public.can_see_lesson(v_lesson) then v_lesson := null; end if;

  -- 1) разбор ответов, прогресс слов, XP за слово (не более 2 начислений на слово в день)
  for e in select * from jsonb_array_elements(v_events) loop
    w := e->>'w';
    if w is null or w !~ '^[A-Za-z0-9_.:-]{1,60}$' then continue; end if;
    ok := coalesce((e->>'ok')::boolean, false);
    skill := coalesce(e->>'k', 'recognition');
    retry := coalesce((e->>'r')::boolean, false);
    hinted := coalesce((e->>'h')::boolean, false);
    v_total := v_total + 1;
    if skill = 'self' then continue; end if;          -- самооценка карточек: не ответ и не XP
    if hinted then v_hints := v_hints + 1; end if;
    if not retry then
      v_first := v_first + 1;
      if ok and not hinted then v_first_ok := v_first_ok + 1; end if;
    end if;
    if skill = 'recall' then v_recall_total := v_recall_total + 1; if ok then v_recall_ok := v_recall_ok + 1; end if; end if;
    insert into public.word_progress(user_id, word_id) values (uid, w) on conflict do nothing;
    if ok then
      v_correct := v_correct + 1;
      update public.word_progress set right_count = right_count + 1,
             recall_count = recall_count + case when skill = 'recall' then 1 else 0 end,
             streak = streak + 1, last_at = now()
       where user_id = uid and word_id = w;
      insert into public.xp_word_days(user_id, day, word_id, n) values (uid, v_day, w, 0) on conflict do nothing;
      select xp_word_days.n into n from public.xp_word_days where user_id = uid and day = v_day and word_id = w for update;
      if n < 2 then
        gain := case when skill = 'recall' then 4 else 2 end;
        v_xp := v_xp + gain;
        update public.xp_word_days set n = xp_word_days.n + 1 where user_id = uid and day = v_day and word_id = w;
      end if;
    else
      v_wrong := v_wrong + 1;
      update public.word_progress set wrong_count = wrong_count + 1, streak = 0, last_at = now()
       where user_id = uid and word_id = w;
    end if;
  end loop;

  -- интервальное повторение: дата следующего повтора из снимка клиента (ограничена 0..60 днями)
  if jsonb_typeof(p->'progress') = 'object' then
    for w, snap in select key, value from jsonb_each(p->'progress') limit 400 loop
      if w !~ '^[A-Za-z0-9_.:-]{1,60}$' or jsonb_typeof(snap) <> 'object' then continue; end if;
      begin
        update public.word_progress
           set due_at = least(greatest(to_timestamp(((snap->>'due')::numeric) / 1000), now() - interval '1 day'), now() + interval '60 days')
         where user_id = uid and word_id = w and snap ? 'due';
      exception when others then null; end;
    end loop;
  end if;

  v_acc := case when v_first > 0 then round(100.0 * v_first_ok / v_first) end;

  -- рейтинг: ключ проверяется по формату и режиму; время правдоподобно (не меньше 0,4 с на ответ)
  if v_board is not null and (v_board !~ '^[a-z]{2,12}\|[a-z0-9]{1,12}\|n[0-9]{1,3}(\|w[a-z0-9]{1,8})?(\|t[a-z,]{2,80})?$' or split_part(v_board, '|', 1) <> v_mode) then v_board := null; end if;
  begin v_seconds := round((p->>'seconds')::numeric, 1); exception when others then v_seconds := null; end;
  if v_seconds is not null and (v_seconds > 7200 or v_seconds < greatest(1, v_total * 0.4)) then v_seconds := null; end if;
  begin v_mistakes := least(greatest((p->>'mistakes')::int, 0), 10000); exception when others then v_mistakes := null; end;

  -- 2) миссии дня (по 25 XP, не больше трёх разных в день) и сундук (40 XP, раз в день)
  if jsonb_typeof(p->'missions') = 'array' then
    for c in select jsonb_array_elements_text(p->'missions') loop
      if c = any(allowed_claims) then
        select count(*) into v_claims from public.xp_claims where user_id = uid and day = v_day and claim <> 'chest';
        if v_claims < 3 then
          insert into public.xp_claims(user_id, day, claim, xp) values (uid, v_day, c, 25) on conflict do nothing;
          if found then v_xp := v_xp + 25; update public.user_stats set missions_total = missions_total + 1 where user_id = uid; end if;
        end if;
      end if;
    end loop;
  end if;
  if coalesce((p->>'chest')::boolean, false)
     and (select count(*) from public.xp_claims where user_id = uid and day = v_day and claim <> 'chest') >= 3 then
    insert into public.xp_claims(user_id, day, claim, xp) values (uid, v_day, 'chest', 40) on conflict do nothing;
    if found then v_xp := v_xp + 40; end if;
  end if;

  -- 3) страж модуля: сервер сам проверяет результат (≥80 % первых ответов и ≥70 % по памяти)
  if v_mode = 'boss' and v_finished and v_first >= 3 and v_first_ok * 10 >= v_first * 8
     and v_recall_total > 0 and v_recall_ok * 10 >= v_recall_total * 7 and nullif(p->>'boss_key','') is not null then
    insert into public.boss_wins(user_id, boss_key) values (uid, left(p->>'boss_key', 80)) on conflict do nothing;
    if found then v_xp := v_xp + 50; update public.user_stats set bosses = bosses + 1 where user_id = uid; end if;
  end if;

  -- 4) серия дней и идеальные раунды
  insert into public.user_stats(user_id) values (uid) on conflict do nothing;
  select * into st from public.user_stats where user_id = uid for update;
  if v_finished and v_total > 0 then
    if st.streak_last is null or st.streak_last < v_day then
      st.streak_count := case when st.streak_last = v_day - 1 then st.streak_count + 1 else 1 end;
      st.streak_last := v_day;
      st.streak_best := greatest(st.streak_best, st.streak_count);
    end if;
    if v_mode not in ('cards','pairs') and v_first >= 5 and v_first_ok = v_first then st.perfect_games := st.perfect_games + 1; end if;
  end if;
  update public.user_stats set xp = xp + v_xp, streak_count = st.streak_count, streak_best = st.streak_best,
         streak_last = st.streak_last, perfect_games = st.perfect_games, updated_at = now()
   where user_id = uid returning * into st;

  insert into public.sessions(user_id, client_id, assignment_id, lesson_id, grade, section_index, scope, route, title, mode, finished,
                              total, first_correct, correct, wrong, hints, accuracy, xp, events, local_day, board_key, seconds, mistakes)
  values (uid, v_client, v_assignment, v_lesson, v_grade, v_section,
          case when v_assignment is not null then 'assignment' else v_scope end, v_route, v_title, v_mode, v_finished,
          v_total, v_first_ok, v_correct, v_wrong, v_hints, v_acc, v_xp, v_events, v_day,
          case when v_finished then v_board end, v_seconds, v_mistakes)
  returning id into v_sid;

  return jsonb_build_object('duplicate', false, 'session_id', v_sid, 'xp_gained', v_xp, 'xp', st.xp, 'streak', st.streak_count,
                            'accuracy', v_acc, 'assignment_id', v_assignment);
end $$;
COMMIT;
