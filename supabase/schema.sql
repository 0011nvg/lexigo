-- =====================================================================
-- LEXI — облачная схема (Supabase / PostgreSQL 15+)            v1 2026-11-02
-- Аккаунты учеников и учителей, группы, задания, свои уроки, прогресс.
--
-- Как применить: Supabase Dashboard → SQL Editor → New query → вставить
-- весь файл → Run. Скрипт можно запускать повторно (идемпотентен).
--
-- Принципы безопасности:
--  * Row Level Security включён на КАЖДОЙ таблице, по умолчанию — запрет.
--  * Прогресс, XP и награды пишутся ТОЛЬКО через функции submit_session /
--    import_guest_progress: клиент не может напрямую изменить свои очки.
--  * Учитель видит только учеников своих групп; ученик — только себя.
--  * Электронная почта хранится только в auth.users (Supabase Auth),
--    в публичных таблицах её нет. Пароли хранит Supabase Auth (bcrypt).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;  -- в Supabase уже установлено

-- Список игр LEXI — ЕДИНСТВЕННОЕ место на сервере, где он записан (v2 2026-11-02).
-- Количество игр в уроке и задании не ограничено: можно выбрать одну, несколько или все.
-- Новая игра в LEXI = добавить её код сюда и в ASSIGNABLE/MODES в cloud-core.js.
create or replace function public.lexi_modes_ok(m text[]) returns boolean
language sql immutable set search_path = '' as $$
  select m is not null and cardinality(m) between 1 and 40
     and m <@ array['cards','quiz','spell','pairs','truefalse','fix','audio','crystals','boss','mixed','builder','listen','review']::text[]
     and cardinality(m) = (select count(distinct x) from unnest(m) x)
$$;

-- ---------------------------------------------------------------------
-- 1. Таблицы
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          text not null check (role in ('student','teacher')),
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar        text not null default 'cat' check (avatar ~ '^[a-z0-9-]{1,20}$'),
  created_at    timestamptz not null default now()
);

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  join_code   text not null unique check (join_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at  timestamptz not null default now()
);
create index if not exists groups_teacher_idx on public.groups(teacher_id);

create table if not exists public.group_members (
  group_id    uuid not null references public.groups(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (group_id, student_id)
);
create index if not exists group_members_student_idx on public.group_members(student_id);

create table if not exists public.custom_lessons (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 80),
  words       jsonb not null check (jsonb_typeof(words) = 'array' and jsonb_array_length(words) between 2 and 200 and pg_column_size(words) < 60000),
  modes       text[],          -- игры урока; null = все игры LEXI
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists custom_lessons_owner_idx on public.custom_lessons(owner_id);
-- v2: игры урока (для баз, созданных версией v1)
alter table public.custom_lessons add column if not exists modes text[];
alter table public.custom_lessons drop constraint if exists custom_lessons_modes_check;
alter table public.custom_lessons add constraint custom_lessons_modes_check check (modes is null or public.lexi_modes_ok(modes));

create table if not exists public.assignments (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.groups(id) on delete cascade,
  teacher_id       uuid not null references public.profiles(id) on delete cascade,
  student_id       uuid references public.profiles(id) on delete cascade,      -- null = вся группа
  title            text not null check (char_length(btrim(title)) between 1 and 120),
  grade            int check (grade between 2 and 9),
  section_indexes  int[] check (section_indexes is null or (cardinality(section_indexes) between 1 and 60)),
  word_ids         text[] check (word_ids is null or cardinality(word_ids) between 2 and 300),
  lesson_id        uuid references public.custom_lessons(id) on delete cascade,
  modes            text[] not null,
  due_at           timestamptz,
  comment          text check (comment is null or char_length(comment) <= 500),
  created_at       timestamptz not null default now(),
  check ((lesson_id is null) <> (grade is null)),
  check (lesson_id is not null or section_indexes is not null)
);
create index if not exists assignments_group_idx on public.assignments(group_id);
-- v2: снято ограничение «не больше 6 игр в задании»
alter table public.assignments drop constraint if exists assignments_modes_check;
alter table public.assignments add constraint assignments_modes_check check (public.lexi_modes_ok(modes));
create index if not exists assignments_teacher_idx on public.assignments(teacher_id);

create table if not exists public.sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  client_id      text not null check (client_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  assignment_id  uuid references public.assignments(id) on delete set null,
  lesson_id      uuid references public.custom_lessons(id) on delete set null,
  grade          int check (grade between 2 and 9),
  section_index  int check (section_index between 0 and 999),
  scope          text not null check (scope in ('lesson','module','book','custom','assignment','other')),
  route          text check (route is null or route ~ '^/lesson/[0-9]{1,2}/m?[0-9]{1,3}$'),
  title          text check (title is null or char_length(title) <= 120),
  mode           text not null check (mode ~ '^[a-z]{2,12}$'),
  finished       boolean not null default false,
  total          int not null default 0,
  first_correct  int not null default 0,
  correct        int not null default 0,
  wrong          int not null default 0,
  hints          int not null default 0,
  accuracy       int check (accuracy between 0 and 100),
  xp             int not null default 0,
  events         jsonb not null default '[]'::jsonb,
  local_day      date not null,
  created_at     timestamptz not null default now(),
  unique (user_id, client_id)
);
create index if not exists sessions_user_idx on public.sessions(user_id, created_at desc);
create index if not exists sessions_assignment_idx on public.sessions(assignment_id);
-- v2 (рейтинг ТОП-3): ключ таблицы рекордов, время и ошибки раунда
alter table public.sessions add column if not exists board_key text;
alter table public.sessions add column if not exists seconds numeric(7,1);
alter table public.sessions add column if not exists mistakes int;
alter table public.sessions drop constraint if exists sessions_board_key_check;
alter table public.sessions add constraint sessions_board_key_check check (board_key is null or board_key ~ '^[a-z]{2,12}\|[a-z0-9]{1,12}\|n[0-9]{1,3}(\|w[a-z0-9]{1,8})?(\|t[a-z,]{2,80})?$');
alter table public.sessions drop constraint if exists sessions_seconds_check;
alter table public.sessions add constraint sessions_seconds_check check (seconds is null or seconds between 0 and 7200);
alter table public.sessions drop constraint if exists sessions_mistakes_check;
alter table public.sessions add constraint sessions_mistakes_check check (mistakes is null or mistakes between 0 and 10000);

create table if not exists public.word_progress (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  word_id       text not null check (word_id ~ '^[A-Za-z0-9_.:-]{1,60}$'),
  right_count   int not null default 0,
  wrong_count   int not null default 0,
  recall_count  int not null default 0,
  streak        int not null default 0,
  last_at       timestamptz,
  due_at        timestamptz,
  primary key (user_id, word_id)
);

create table if not exists public.user_stats (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  xp              int not null default 0,
  streak_count    int not null default 0,
  streak_best     int not null default 0,
  streak_last     date,
  perfect_games   int not null default 0,
  missions_total  int not null default 0,
  bosses          int not null default 0,
  guest_imported  boolean not null default false,
  updated_at      timestamptz not null default now()
);

-- служебные таблицы защиты от повторного начисления наград (только для функций)
create table if not exists public.xp_word_days (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  day      date not null,
  word_id  text not null,
  n        smallint not null default 0,
  primary key (user_id, day, word_id)
);
create table if not exists public.xp_claims (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  day      date not null,
  claim    text not null,
  xp       int not null,
  primary key (user_id, day, claim)
);
create table if not exists public.boss_wins (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  boss_key text not null check (char_length(boss_key) <= 80),
  won_at   timestamptz not null default now(),
  primary key (user_id, boss_key)
);

-- ---------------------------------------------------------------------
-- 2. Вспомогательные функции доступа (security definer, без рекурсии RLS)
-- ---------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.owns_group(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.groups where id = g and teacher_id = auth.uid())
$$;

create or replace function public.is_member_of(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and student_id = auth.uid())
$$;

create or replace function public.is_teacher_of(student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members m join public.groups g on g.id = m.group_id
                 where m.student_id = student and g.teacher_id = auth.uid())
$$;

create or replace function public.is_my_teacher(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.groups g join public.group_members m on m.group_id = g.id
                 where g.teacher_id = t and m.student_id = auth.uid())
$$;

create or replace function public.can_see_assignment(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assignments x
                 where x.id = a and (x.teacher_id = auth.uid()
                   or ((x.student_id is null or x.student_id = auth.uid())
                       and exists (select 1 from public.group_members m where m.group_id = x.group_id and m.student_id = auth.uid()))))
$$;

create or replace function public.can_see_lesson(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.custom_lessons c where c.id = l and c.owner_id = auth.uid())
      or exists (select 1 from public.assignments x where x.lesson_id = l and public.can_see_assignment(x.id))
$$;

-- ---------------------------------------------------------------------
-- 3. Профиль создаётся автоматически при регистрации
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r text := coalesce(new.raw_user_meta_data->>'role', 'student');
  n text := btrim(coalesce(new.raw_user_meta_data->>'display_name', ''));
begin
  if r not in ('student','teacher') then r := 'student'; end if;
  n := left(regexp_replace(n, '[[:cntrl:]<>]', '', 'g'), 40);
  if n = '' then n := case when r = 'teacher' then 'Учитель' else 'Ученик' end; end if;
  insert into public.profiles(id, role, display_name) values (new.id, r, n) on conflict (id) do nothing;
  insert into public.user_stats(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. Права: по умолчанию ничего, затем точечно
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['profiles','groups','group_members','custom_lessons','assignments','sessions','word_progress','user_stats','xp_word_days','xp_claims','boss_wins'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant select on public.profiles, public.groups, public.group_members, public.custom_lessons, public.assignments,
                public.sessions, public.word_progress, public.user_stats to authenticated;
grant update (display_name, avatar) on public.profiles to authenticated;
grant update (name) on public.groups to authenticated;
grant delete on public.groups, public.group_members, public.custom_lessons, public.assignments to authenticated;
grant insert (owner_id, title, words, modes) on public.custom_lessons to authenticated;
grant update (title, words, modes, updated_at) on public.custom_lessons to authenticated;
grant insert (group_id, teacher_id, student_id, title, grade, section_indexes, word_ids, lesson_id, modes, due_at, comment) on public.assignments to authenticated;
grant update (title, due_at, comment) on public.assignments to authenticated;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_teacher_of(id) or public.is_my_teacher(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- groups
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (teacher_id = auth.uid() or public.is_member_of(id));
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete to authenticated using (teacher_id = auth.uid());

-- group_members
drop policy if exists members_select on public.group_members;
create policy members_select on public.group_members for select to authenticated
  using (student_id = auth.uid() or public.owns_group(group_id));
drop policy if exists members_delete on public.group_members;
create policy members_delete on public.group_members for delete to authenticated
  using (student_id = auth.uid() or public.owns_group(group_id));

-- custom_lessons
drop policy if exists lessons_select on public.custom_lessons;
create policy lessons_select on public.custom_lessons for select to authenticated using (public.can_see_lesson(id));
drop policy if exists lessons_insert on public.custom_lessons;
create policy lessons_insert on public.custom_lessons for insert to authenticated
  with check (owner_id = auth.uid() and public.my_role() = 'teacher');
drop policy if exists lessons_update on public.custom_lessons;
create policy lessons_update on public.custom_lessons for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists lessons_delete on public.custom_lessons;
create policy lessons_delete on public.custom_lessons for delete to authenticated using (owner_id = auth.uid());

-- assignments
drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select to authenticated using (public.can_see_assignment(id));
drop policy if exists assignments_insert on public.assignments;
create policy assignments_insert on public.assignments for insert to authenticated
  with check (teacher_id = auth.uid() and public.owns_group(group_id)
    and (student_id is null or exists (select 1 from public.group_members m where m.group_id = assignments.group_id and m.student_id = assignments.student_id))
    and (lesson_id is null or exists (select 1 from public.custom_lessons c where c.id = assignments.lesson_id and c.owner_id = auth.uid())));
drop policy if exists assignments_update on public.assignments;
create policy assignments_update on public.assignments for update to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists assignments_delete on public.assignments;
create policy assignments_delete on public.assignments for delete to authenticated using (teacher_id = auth.uid());

-- результаты: ученик — свои, учитель — ученики своих групп; запись только через функции
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select to authenticated
  using (user_id = auth.uid() or public.is_teacher_of(user_id));
drop policy if exists wp_select on public.word_progress;
create policy wp_select on public.word_progress for select to authenticated
  using (user_id = auth.uid() or public.is_teacher_of(user_id));
drop policy if exists stats_select on public.user_stats;
create policy stats_select on public.user_stats for select to authenticated
  using (user_id = auth.uid() or public.is_teacher_of(user_id));

-- ---------------------------------------------------------------------
-- 5. Функции (RPC)
-- ---------------------------------------------------------------------
create or replace function public.new_join_code() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int; b bytea;
begin
  loop
    b := gen_random_bytes(8); c := '';
    for i in 0..7 loop c := c || substr(alphabet, (get_byte(b, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.groups where join_code = c);
  end loop;
  return c;
end $$;

create or replace function public.create_group(p_name text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null or public.my_role() <> 'teacher' then raise exception 'only teachers can create groups' using errcode = '42501'; end if;
  if (select count(*) from public.groups where teacher_id = auth.uid()) >= 50 then raise exception 'group limit reached'; end if;
  insert into public.groups(teacher_id, name, join_code) values (auth.uid(), btrim(p_name), public.new_join_code()) returning * into g;
  return g;
end $$;

create or replace function public.regenerate_join_code(p_group uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.owns_group(p_group) then raise exception 'not your group' using errcode = '42501'; end if;
  c := public.new_join_code();
  update public.groups set join_code = c where id = p_group;
  return c;
end $$;

create or replace function public.join_group(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.groups; code text := upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null or public.my_role() <> 'student' then raise exception 'only students can join groups' using errcode = '42501'; end if;
  if (select count(*) from public.group_members where student_id = auth.uid()) >= 20 then raise exception 'group limit reached'; end if;
  select * into g from public.groups where join_code = code;
  if not found then return jsonb_build_object('ok', false); end if;
  insert into public.group_members(group_id, student_id) values (g.id, auth.uid()) on conflict do nothing;
  return jsonb_build_object('ok', true, 'group_id', g.id, 'name', g.name);
end $$;

-- Главная функция: сохранить результат тренировки и начислить награды на сервере.
-- Повторная отправка той же тренировки (client_id) ничего не начисляет повторно.
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
  if v_grade is not null and (v_grade < 2 or v_grade > 9) then v_grade := null; end if;
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

-- Перенос прогресса гостя (этого устройства) в аккаунт: один раз, без XP, с ограничениями.
create or replace function public.import_guest_progress(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); w text; r jsonb; cnt int := 0;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'bad payload'; end if;
  if (select guest_imported from public.user_stats where user_id = uid) then return jsonb_build_object('imported', 0, 'already', true); end if;
  for w, r in select key, value from jsonb_each(p) limit 3000 loop
    if w !~ '^[A-Za-z0-9_.:-]{1,60}$' or jsonb_typeof(r) <> 'object' then continue; end if;
    begin
      insert into public.word_progress(user_id, word_id, right_count, wrong_count, recall_count, streak, last_at, due_at)
      values (uid, w,
              least(greatest(coalesce((r->>'right')::int, 0), 0), 50),
              least(greatest(coalesce((r->>'wrong')::int, 0), 0), 50),
              least(greatest(coalesce((r->>'recall')::int, 0), 0), 50),
              least(greatest(coalesce((r->>'streak')::int, 0), 0), 20),
              case when r ? 'last' then least(to_timestamp(((r->>'last')::numeric) / 1000), now()) end,
              case when r ? 'due' then least(to_timestamp(((r->>'due')::numeric) / 1000), now() + interval '60 days') end)
      on conflict (user_id, word_id) do update set
        right_count = greatest(word_progress.right_count, excluded.right_count),
        wrong_count = greatest(word_progress.wrong_count, excluded.wrong_count),
        recall_count = greatest(word_progress.recall_count, excluded.recall_count),
        last_at = greatest(word_progress.last_at, excluded.last_at),
        due_at = coalesce(word_progress.due_at, excluded.due_at);
      cnt := cnt + 1;
    exception when others then null; end;
  end loop;
  update public.user_stats set guest_imported = true where user_id = uid;
  return jsonb_build_object('imported', cnt, 'already', false);
end $$;

-- Удаление аккаунта и всех связанных данных (каскадом).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.create_group(text), public.regenerate_join_code(uuid), public.join_group(text),
  public.submit_session(jsonb), public.import_guest_progress(jsonb), public.delete_my_account(), public.new_join_code() from public, anon;
grant execute on function public.create_group(text), public.regenerate_join_code(uuid), public.join_group(text),
  public.submit_session(jsonb), public.import_guest_progress(jsonb), public.delete_my_account() to authenticated;
revoke all on function public.new_join_code() from authenticated;
-- служебные функции проверки прав: только для вошедших пользователей (их вызывают правила RLS), не для анонимов
revoke all on function public.my_role(), public.owns_group(uuid), public.is_member_of(uuid), public.is_teacher_of(uuid),
  public.is_my_teacher(uuid), public.can_see_assignment(uuid), public.can_see_lesson(uuid) from public, anon;
grant execute on function public.my_role(), public.owns_group(uuid), public.is_member_of(uuid), public.is_teacher_of(uuid),
  public.is_my_teacher(uuid), public.can_see_assignment(uuid), public.can_see_lesson(uuid) to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- =====================================================================
-- v2 · ТОП-3 рекордов (2026-11-02)
-- Отдельная таблица на каждый «ключ»: режим + урок/набор слов + число слов раунда
-- (+ для финального теста — набор слов и типы заданий). Записать результат можно
-- только своей завершённой тренировкой, которую сохранил сервер; место считает сервер.
-- =====================================================================
create table if not exists public.leaderboard (
  board_key    text not null,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  session_id   uuid references public.sessions(id) on delete set null,
  name         text not null check (char_length(name) between 2 and 20),
  accuracy     int,
  seconds      numeric(7,1),
  mistakes     int,
  achieved_at  timestamptz not null default now(),
  primary key (board_key, user_id)
);
alter table public.leaderboard enable row level security;
revoke all on public.leaderboard from anon, authenticated;

-- ключ сортировки: меньше — лучше. «Найди пару»: время, затем ошибки. Остальные: точность, затем время.
create or replace function public.lb_k1(p_board text, p_acc int, p_sec numeric) returns numeric
language sql immutable set search_path = '' as $$ select case when p_board like 'pairs|%' then coalesce(p_sec, 99999) else -coalesce(p_acc, -1) end::numeric $$;
create or replace function public.lb_k2(p_board text, p_sec numeric, p_mis int) returns numeric
language sql immutable set search_path = '' as $$ select case when p_board like 'pairs|%' then coalesce(p_mis, 99999) else coalesce(p_sec, 99999) end::numeric $$;

create or replace function public.leaderboard_top(p_board text)
returns table(place int, name text, accuracy int, seconds numeric, mistakes int, mine boolean, achieved date)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by public.lb_k1(l.board_key, l.accuracy, l.seconds), public.lb_k2(l.board_key, l.seconds, l.mistakes), l.achieved_at))::int,
         l.name, l.accuracy, l.seconds, l.mistakes, (l.user_id = auth.uid()), l.achieved_at::date
  from public.leaderboard l where l.board_key = p_board
  order by 1 limit 3
$$;

create or replace function public.leaderboard_preview(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.sessions; own public.leaderboard; c1 numeric; c2 numeric; pl int;
begin
  if auth.uid() is null then return jsonb_build_object('qualifies', false, 'reason', 'guest'); end if;
  select * into s from public.sessions where id = p_session and user_id = auth.uid();
  if not found or s.board_key is null or not s.finished or s.created_at < now() - interval '2 hours'
     or (s.board_key like 'pairs|%' and s.seconds is null) or (s.board_key not like 'pairs|%' and s.accuracy is null) then
    return jsonb_build_object('qualifies', false, 'reason', 'not_eligible');
  end if;
  c1 := public.lb_k1(s.board_key, s.accuracy, s.seconds); c2 := public.lb_k2(s.board_key, s.seconds, s.mistakes);
  select * into own from public.leaderboard where board_key = s.board_key and user_id = auth.uid();
  if found and own.session_id = s.id then return jsonb_build_object('qualifies', false, 'reason', 'already', 'board_key', s.board_key); end if;
  if found and (public.lb_k1(own.board_key, own.accuracy, own.seconds), public.lb_k2(own.board_key, own.seconds, own.mistakes)) <= (c1, c2) then
    return jsonb_build_object('qualifies', false, 'reason', 'own_better', 'board_key', s.board_key);
  end if;
  select 1 + count(*) into pl from public.leaderboard l
   where l.board_key = s.board_key and l.user_id <> auth.uid()
     and (public.lb_k1(l.board_key, l.accuracy, l.seconds), public.lb_k2(l.board_key, l.seconds, l.mistakes)) <= (c1, c2);
  return jsonb_build_object('qualifies', pl <= 3, 'place', pl, 'board_key', s.board_key, 'accuracy', s.accuracy, 'seconds', s.seconds, 'mistakes', s.mistakes);
end $$;

create or replace function public.leaderboard_claim(p_session uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pre jsonb; s public.sessions; n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if n !~ '^[A-Za-zА-Яа-яЁё0-9 ._-]{2,20}$' then raise exception 'bad name' using errcode = '22023'; end if;
  pre := public.leaderboard_preview(p_session);
  if not coalesce((pre->>'qualifies')::boolean, false) then return jsonb_build_object('ok', false, 'reason', pre->>'reason'); end if;
  select * into s from public.sessions where id = p_session;
  insert into public.leaderboard(board_key, user_id, session_id, name, accuracy, seconds, mistakes, achieved_at)
  values (s.board_key, auth.uid(), s.id, n, s.accuracy, s.seconds, s.mistakes, now())
  on conflict (board_key, user_id) do update set session_id = excluded.session_id, name = excluded.name, accuracy = excluded.accuracy,
    seconds = excluded.seconds, mistakes = excluded.mistakes, achieved_at = excluded.achieved_at;
  return jsonb_build_object('ok', true, 'place', (pre->>'place')::int, 'board_key', s.board_key);
end $$;

revoke all on function public.leaderboard_top(text), public.leaderboard_preview(uuid), public.leaderboard_claim(uuid, text),
  public.lb_k1(text, int, numeric), public.lb_k2(text, numeric, int) from public, anon;
grant execute on function public.leaderboard_top(text) to anon, authenticated;
grant execute on function public.leaderboard_preview(uuid), public.leaderboard_claim(uuid, text) to authenticated;
grant execute on function public.lb_k1(text, int, numeric), public.lb_k2(text, numeric, int) to anon, authenticated;

-- =====================================================================
-- v3 · «Кристальная экспедиция» (2026-11-02): рекорды уровней и рейтинг
-- Уровень начинается вызовом crystal_start (сервер запоминает уровень, день поля и время),
-- заканчивается crystal_finish: сервер проверяет правдоподобие результата, сам считает звёзды
-- и рейтинговые очки (как crystal-engine.js) и не даёт отправить одну партию дважды.
-- В рейтинге — только ник (или «Исследователь XXXX»), без имени и почты.
-- =====================================================================
create table if not exists public.crystal_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  level        int not null check (level between 1 and 5),
  day          date not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  won          boolean,
  stars        int check (stars between 0 and 3),
  score        int check (score between 0 and 10000000),
  moves_left   int check (moves_left between 0 and 300),
  moves_used   int check (moves_used between 0 and 300),
  words_ok     int check (words_ok between 0 and 200),
  words_tried  int check (words_tried between 0 and 200),
  rating       int not null default 0
);
create index if not exists crystal_runs_user_idx on public.crystal_runs(user_id, level);
create table if not exists public.crystal_names (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  name        text not null check (name ~ '^[A-Za-zА-Яа-яЁё0-9 ._-]{2,20}$'),
  updated_at  timestamptz not null default now()
);
alter table public.crystal_runs enable row level security;
alter table public.crystal_names enable row level security;
revoke all on public.crystal_runs, public.crystal_names from anon, authenticated;
grant select on public.crystal_runs, public.crystal_names to authenticated;
drop policy if exists crystal_runs_select on public.crystal_runs;
create policy crystal_runs_select on public.crystal_runs for select to authenticated using (user_id = auth.uid());
drop policy if exists crystal_names_select on public.crystal_names;
create policy crystal_names_select on public.crystal_names for select to authenticated using (user_id = auth.uid());

-- Параметры уровней — те же, что в crystal-engine.js (проверяется тестом tests/crystal-engine.mjs):
-- ходы, звёзды (1 — порог цели по очкам, 2, 3), сколько слов нужно ответить верно, есть ли цель по очкам.
create or replace function public.crystal_cfg(p_level int, out moves int, out s1 int, out s2 int, out s3 int, out words int, out score_goal boolean)
language sql immutable set search_path = '' as $$
  select c.moves, c.s1, c.s2, c.s3, c.words, c.score_goal from (values
    (1, 20, 3000, 4800, 6600, 3, true),
    (2, 20, 4600, 6800, 8600, 3, true),
    (3, 22, 6800, 10000, 12500, 4, true),
    (4, 24, 5500, 8200, 10200, 4, false),
    (5, 26, 8000, 10500, 12500, 5, true)
  ) as c(level, moves, s1, s2, s3, words, score_goal) where c.level = p_level
$$;

-- рейтинговые очки уровня: звёзды важнее всего; очки уровня — с пределом, чтобы не решала удача
create or replace function public.crystal_rating(p_level int, p_won boolean, p_stars int, p_score int, p_moves_left int, p_words_ok int, p_words_tried int)
returns int language plpgsql immutable set search_path = '' as $$
declare c record; top numeric;
begin
  if not coalesce(p_won, false) then return 0; end if;
  select * into c from public.crystal_cfg(p_level); if c.moves is null then return 0; end if;
  top := c.s3 * 2;
  return p_stars * 1000 + round(500 * least(p_score, top) / top)::int + 15 * least(greatest(p_moves_left, 0), 30)
       + round(300 * (case when p_words_tried > 0 then p_words_ok::numeric / p_words_tried else 0 end))::int;
end $$;

create or replace function public.crystal_start(p_level int, p_day date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_day date; v_id uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_level is null or p_level < 1 or p_level > 5 then raise exception 'bad level' using errcode = '22023'; end if;
  if p_level > 1 and not exists (select 1 from public.crystal_runs where user_id = uid and level = p_level - 1 and won) then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  if (select count(*) from public.crystal_runs where user_id = uid and started_at > now() - interval '10 minutes') >= 40 then
    raise exception 'too many runs, slow down' using errcode = '54000';
  end if;
  v_day := case when p_day between current_date - 1 and current_date + 1 then p_day else current_date end;
  insert into public.crystal_runs(user_id, level, day) values (uid, p_level, v_day) returning id into v_id;
  return jsonb_build_object('ok', true, 'run_id', v_id, 'day', v_day);
end $$;

create or replace function public.crystal_totals(p_user uuid, out total int, out stars int, out place int)
language sql stable security definer set search_path = public as $$
  with best as (select user_id, level, max(rating) r, max(stars) s, min(finished_at) filter (where rating > 0) t
                  from public.crystal_runs where finished_at is not null group by user_id, level),
       tot as (select user_id, sum(r)::int total, sum(s)::int stars from best group by user_id having sum(r) > 0)
  select coalesce((select total from tot where user_id = p_user), 0),
         coalesce((select stars from tot where user_id = p_user), 0),
         case when exists (select 1 from tot where user_id = p_user)
              then 1 + (select count(*) from tot o where o.total > (select total from tot where user_id = p_user))::int end
$$;

create or replace function public.crystal_finish(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.crystal_runs; c record; prev int;
  v_won boolean; v_score int; v_left int; v_used int; v_ok int; v_tried int; v_stars int; v_rating int; tt record;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  begin
    select * into r from public.crystal_runs where id = (p->>'run_id')::uuid and user_id = uid for update;
  exception when others then return jsonb_build_object('ok', false, 'reason', 'run'); end;
  if not found then return jsonb_build_object('ok', false, 'reason', 'run'); end if;
  if r.finished_at is not null then   -- повторная отправка той же партии ничего не меняет
    select * into tt from public.crystal_totals(uid);
    return jsonb_build_object('ok', true, 'duplicate', true, 'counted', r.rating > 0, 'rating', r.rating, 'total', tt.total, 'place', tt.place, 'improved', false);
  end if;
  if r.started_at < now() - interval '6 hours' then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  select * into c from public.crystal_cfg(r.level);
  begin
    v_won := coalesce((p->>'won')::boolean, false); v_score := (p->>'score')::int; v_left := (p->>'moves_left')::int; v_used := (p->>'moves_used')::int;
    v_ok := (p->>'words_ok')::int; v_tried := (p->>'words_tried')::int;
  exception when others then return jsonb_build_object('ok', false, 'reason', 'bad'); end;
  -- правдоподобие: каждый верный ответ даёт ровно +1 ход; очки не выше предела; на ход нужно время
  if v_score is null or v_left is null or v_used is null or v_ok is null or v_tried is null
     or v_score < 0 or v_left < 0 or v_used < 1 or v_ok < 0 or v_ok > v_tried or v_tried > 60
     or v_used + v_left <> c.moves + v_ok
     or (not v_won and v_left <> 0)
     or v_score > v_used * 9000 + (c.moves + 15) * 250 + 40 * 150
     or now() - r.started_at < make_interval(secs => v_used * 0.7)
     or (v_won and v_ok < c.words)
     or (v_won and c.score_goal and v_score < c.s1) then
    update public.crystal_runs set finished_at = now(), won = false, stars = 0, score = 0, moves_left = 0, moves_used = least(greatest(coalesce(v_used, 0), 0), 300), words_ok = 0, words_tried = 0, rating = 0 where id = r.id;
    return jsonb_build_object('ok', false, 'reason', 'implausible');
  end if;
  v_stars := case when v_won then 1 + (v_score >= c.s2)::int + (v_score >= c.s3)::int else 0 end;
  v_rating := public.crystal_rating(r.level, v_won, v_stars, v_score, v_left, v_ok, v_tried);
  select coalesce(max(rating), 0) into prev from public.crystal_runs where user_id = uid and level = r.level and finished_at is not null;
  update public.crystal_runs set finished_at = now(), won = v_won, stars = v_stars, score = v_score, moves_left = v_left, moves_used = v_used,
    words_ok = v_ok, words_tried = v_tried, rating = v_rating where id = r.id;
  select * into tt from public.crystal_totals(uid);
  return jsonb_build_object('ok', true, 'counted', v_rating > 0, 'stars', v_stars, 'rating', v_rating, 'total', tt.total, 'place', tt.place, 'improved', v_rating > prev);
end $$;

create or replace function public.crystal_my() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); tt record;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into tt from public.crystal_totals(uid);
  return jsonb_build_object('name', (select name from public.crystal_names where user_id = uid), 'rating', tt.total, 'stars', tt.stars, 'place', tt.place,
    'levels', coalesce((select jsonb_agg(jsonb_build_object('level', level, 'best_score', best, 'stars', st, 'wins', w, 'rating', rt, 'plays', n) order by level)
      from (select level, max(score) filter (where won) best, max(stars) st, count(*) filter (where won) w, max(rating) rt, count(*) n
              from public.crystal_runs where user_id = uid and finished_at is not null group by level) x), '[]'::jsonb));
end $$;

create or replace function public.crystal_top()
returns table(place int, name text, rating int, stars int, mine boolean)
language sql stable security definer set search_path = public as $$
  with best as (select user_id, level, max(rating) r, max(stars) s, min(finished_at) filter (where rating > 0) t
                  from public.crystal_runs where finished_at is not null group by user_id, level),
       tot as (select user_id, sum(r)::int total, sum(s)::int st, max(t) t from best group by user_id having sum(r) > 0)
  select (row_number() over (order by t.total desc, t.st desc, t.t))::int, coalesce(n.name, 'Исследователь ' || upper(substr(md5(t.user_id::text), 1, 4))),
         t.total, t.st, t.user_id = auth.uid()
  from tot t left join public.crystal_names n on n.user_id = t.user_id
  order by 1 limit 10
$$;

create or replace function public.crystal_set_name(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if n !~ '^[A-Za-zА-Яа-яЁё0-9 ._-]{2,20}$' then return jsonb_build_object('ok', false, 'reason', 'bad_name'); end if;
  insert into public.crystal_names(user_id, name, updated_at) values (auth.uid(), n, now())
  on conflict (user_id) do update set name = excluded.name, updated_at = now();
  return jsonb_build_object('ok', true, 'name', n);
end $$;

revoke all on function public.crystal_cfg(int), public.crystal_rating(int, boolean, int, int, int, int, int), public.crystal_start(int, date),
  public.crystal_totals(uuid), public.crystal_finish(jsonb), public.crystal_my(), public.crystal_top(), public.crystal_set_name(text) from public, anon;
grant execute on function public.crystal_start(int, date), public.crystal_finish(jsonb), public.crystal_my(), public.crystal_top(), public.crystal_set_name(text) to authenticated;
grant execute on function public.crystal_cfg(int), public.crystal_rating(int, boolean, int, int, int, int, int) to authenticated;
revoke all on function public.crystal_totals(uuid) from authenticated;
