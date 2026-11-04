-- Additive, staged migration. Take and restore-test a backup first. Never run
-- against production until it passes the project's isolated Supabase tests.
-- STOP ALL session writes and drain active transactions before migration/backfill.
-- The cutoff alone does not protect against earlier in-flight transactions.
-- See docs/ANSWER-ATTEMPTS-MIGRATION.md for reconciliation and rollback.
begin;

create table if not exists public.answer_attempts (
  event_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_session_id text not null check (client_session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  session_id uuid references public.sessions(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  lesson_id uuid references public.custom_lessons(id) on delete set null,
  word_id text not null check (word_id ~ '^[A-Za-z0-9_.:-]{1,60}$'),
  mode text not null check (mode ~ '^[a-z]{2,12}$'),
  correct boolean not null,
  skill text not null check (skill in ('recognition','recall','self')),
  hinted boolean not null,
  retry boolean not null,
  answered_at timestamptz,
  received_at timestamptz not null default now(),
  -- Null for new events. This is the original array position, not an inferred answer time.
  legacy_ordinal integer check (legacy_ordinal is null or legacy_ordinal > 0),
  unique (session_id, legacy_ordinal)
);
create index if not exists answer_attempts_user_date_idx on public.answer_attempts (user_id, answered_at desc, received_at desc);
create index if not exists answer_attempts_user_word_idx on public.answer_attempts (user_id, word_id);
create index if not exists answer_attempts_lesson_idx on public.answer_attempts (lesson_id, user_id);
create index if not exists answer_attempts_assignment_idx on public.answer_attempts (assignment_id, user_id);
create index if not exists answer_attempts_session_idx on public.answer_attempts (user_id, client_session_id);
alter table public.answer_attempts enable row level security;
revoke all on public.answer_attempts from public, anon, authenticated;
grant select on public.answer_attempts to authenticated;
drop policy if exists answer_attempts_select on public.answer_attempts;
create policy answer_attempts_select on public.answer_attempts for select to authenticated
  using (user_id = auth.uid()); -- Teacher access awaits explicit, verified authorization.

-- Snapshot migration boundary only once: re-running cannot manufacture legacy
-- duplicates for sessions saved after the new client starts transmitting events.
create table if not exists public.answer_attempts_migration_state (
  name text primary key,
  started_at timestamptz not null default clock_timestamp()
);
revoke all on public.answer_attempts_migration_state from public, anon, authenticated;
alter table public.answer_attempts_migration_state enable row level security;
insert into public.answer_attempts_migration_state(name) values ('legacy_v1') on conflict do nothing;

-- Legacy sessions have no event timestamps or input text. Keep those unknown.
-- Only transfer events whose stored fields can be interpreted without guessing.
insert into public.answer_attempts(event_id,user_id,client_session_id,session_id,assignment_id,lesson_id,word_id,mode,correct,skill,hinted,retry,legacy_ordinal)
select md5('lexi-legacy-attempt:' || s.id::text || ':' || e.ord::text)::uuid,
 s.user_id,s.client_id,s.id,s.assignment_id,s.lesson_id,e.item->>'w',
 case when e.item->>'m' ~ '^[a-z]{2,12}$' then e.item->>'m' else s.mode end,
 (e.item->>'ok')::boolean,coalesce(e.item->>'k','recognition'),
 coalesce((e.item->>'h')::boolean,false),coalesce((e.item->>'r')::boolean,false),e.ord::integer
from public.sessions s
cross join lateral jsonb_array_elements(case when jsonb_typeof(s.events)='array' then s.events else '[]'::jsonb end) with ordinality e(item,ord)
where s.created_at <= (select started_at from public.answer_attempts_migration_state where name='legacy_v1')
 and e.item->>'w' ~ '^[A-Za-z0-9_.:-]{1,60}$'
 and e.item->>'ok' in ('true','false')
 and coalesce(e.item->>'k','recognition') in ('recognition','recall','self')
 and coalesce(e.item->>'h','false') in ('true','false')
 and coalesce(e.item->>'r','false') in ('true','false')
on conflict do nothing;

-- History recording deliberately does not mutate word_progress, XP, ratings or
-- achievements. The existing submit_session remains responsible for those.
create or replace function public.submit_answer_attempts(p_events jsonb, p_expected_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e jsonb; rec public.answer_attempts; v_id uuid; v_assignment uuid; v_lesson uuid; v_at timestamptz; accepted jsonb := '[]'::jsonb;
begin
 if uid is null or uid is distinct from p_expected_user then raise exception 'account changed' using errcode='42501'; end if;
 if jsonb_typeof(p_events) is distinct from 'array' or pg_catalog.pg_column_size(p_events) > 100000 then raise exception 'bad batch' using errcode='22023'; end if;
 if jsonb_array_length(p_events) not between 1 and 100 then raise exception 'bad batch size' using errcode='22023'; end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(e) is distinct from 'object'
   or coalesce(e->>'client_session_id','') !~ '^[A-Za-z0-9_-]{8,64}$'
   or coalesce(e->>'word_id','') !~ '^[A-Za-z0-9_.:-]{1,60}$'
   or coalesce(e->>'mode','') !~ '^[a-z]{2,12}$'
   or coalesce(e->>'skill','') not in ('recognition','recall','self')
   or jsonb_typeof(e->'correct') is distinct from 'boolean'
   or jsonb_typeof(e->'hinted') is distinct from 'boolean'
   or jsonb_typeof(e->'retry') is distinct from 'boolean' then
   raise exception 'bad event' using errcode='22023';
  end if;
  begin
   v_id := (e->>'event_id')::uuid;
   v_assignment := nullif(e->>'assignment_id','')::uuid;
   v_lesson := nullif(e->>'lesson_id','')::uuid;
   v_at := nullif(e->>'answered_at','')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
   raise exception 'bad event field' using errcode='22023';
  end;
  if v_id is null then raise exception 'missing event id' using errcode='22023'; end if;
  if v_assignment is not null and not public.can_see_assignment(v_assignment) then raise exception 'assignment access denied' using errcode='42501'; end if;
  if v_lesson is not null and not public.can_see_lesson(v_lesson) then raise exception 'lesson access denied' using errcode='42501'; end if;
  insert into public.answer_attempts(event_id,user_id,client_session_id,assignment_id,lesson_id,word_id,mode,correct,skill,hinted,retry,answered_at)
  values(v_id,uid,e->>'client_session_id',v_assignment,v_lesson,e->>'word_id',e->>'mode',(e->>'correct')::boolean,e->>'skill',(e->>'hinted')::boolean,(e->>'retry')::boolean,v_at)
  on conflict (event_id) do nothing;
  select * into rec from public.answer_attempts where event_id=v_id;
  if rec.user_id is distinct from uid or rec.client_session_id is distinct from e->>'client_session_id'
   or rec.assignment_id is distinct from v_assignment or rec.lesson_id is distinct from v_lesson
   or rec.word_id is distinct from e->>'word_id' or rec.mode is distinct from e->>'mode'
   or rec.correct is distinct from (e->>'correct')::boolean or rec.skill is distinct from e->>'skill'
   or rec.hinted is distinct from (e->>'hinted')::boolean or rec.retry is distinct from (e->>'retry')::boolean
   or rec.answered_at is distinct from v_at then
   raise exception 'event identifier conflict' using errcode='22023';
  end if;
  accepted := accepted || to_jsonb(v_id);
 end loop;
 return jsonb_build_object('ok',true,'accepted',accepted);
end $$;
revoke all on function public.submit_answer_attempts(jsonb,uuid) from public, anon;
grant execute on function public.submit_answer_attempts(jsonb,uuid) to authenticated;
-- The wrapper prevents one account's queued session being submitted after a
-- different account signs in; it keeps the existing XP logic unchanged.
create or replace function public.submit_session_for_user(p jsonb, p_expected_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or auth.uid() is distinct from p_expected_user then
  raise exception 'account changed' using errcode='42501';
 end if;
 return public.submit_session(p);
end $$;
revoke all on function public.submit_session_for_user(jsonb,uuid) from public, anon;
grant execute on function public.submit_session_for_user(jsonb,uuid) to authenticated;
commit;
