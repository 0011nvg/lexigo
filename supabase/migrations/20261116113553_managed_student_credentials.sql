-- Credentials extend existing Supabase users; they never replace profiles or progress.
create table public.managed_students (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id),
  username text not null unique check (username ~ '^[a-z][a-z0-9]{7,31}$'),
  created_at timestamptz not null default now()
);
create index managed_students_teacher_idx on public.managed_students(teacher_id);
alter table public.managed_students enable row level security;
revoke all on public.managed_students from public, anon, authenticated;
grant select on public.managed_students to authenticated;
grant all on public.managed_students to service_role;
create policy managed_students_read on public.managed_students for select to authenticated
using (student_id = (select auth.uid()) or
  (teacher_id = (select auth.uid()) and public.is_teacher_of(student_id)));

-- No browser role can read hashes, even for its own account.
create table public.managed_student_secrets (
  student_id uuid primary key references public.managed_students(student_id) on delete cascade,
  password_hash text not null check
    (password_hash ~ '^pbkdf2-sha256\$600000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$'),
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.managed_student_secrets enable row level security;
revoke all on public.managed_student_secrets from public, anon, authenticated;
grant all on public.managed_student_secrets to service_role;

-- A server-only transaction attaches credentials and class membership together.
create function public.register_managed_student(p_teacher uuid, p_student uuid,
  p_group uuid, p_username text, p_hash text) returns void
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.groups g join public.profiles p on p.id=g.teacher_id
    where g.id=p_group and g.teacher_id=p_teacher and p.role='teacher' for update of g;
  if not found then raise exception 'Class unavailable' using errcode='42501'; end if;
  perform 1 from public.profiles where id=p_student and role='student' for update;
  if not found then raise exception 'Student unavailable' using errcode='42501'; end if;
  -- Existing independent users cannot silently become teacher-managed accounts.
  if exists(select 1 from public.group_members where student_id=p_student) then
    raise exception 'Student already has membership' using errcode='23505';
  end if;
  insert into public.managed_students values(p_student,p_teacher,p_username,now());
  insert into public.managed_student_secrets(student_id,password_hash) values(p_student,p_hash);
  insert into public.group_members(group_id,student_id) values(p_group,p_student);
end $$;
revoke all on function public.register_managed_student(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.register_managed_student(uuid,uuid,uuid,text,text) to service_role;

create function public.move_managed_student(p_student uuid, p_from uuid, p_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or p_from=p_to then raise exception 'Invalid move' using errcode='42501'; end if;
  -- Stable lock order protects concurrent moves and class deletion.
  perform 1 from public.groups where id in(p_from,p_to) order by id for update;
  if (select count(*) from public.groups where id in(p_from,p_to) and teacher_id=actor) <> 2
    or not exists(select 1 from public.profiles where id=actor and role='teacher') then
    raise exception 'Class unavailable' using errcode='42501';
  end if;
  perform 1 from public.managed_students where student_id=p_student and teacher_id=actor for update;
  if not found then raise exception 'Student unavailable' using errcode='42501'; end if;
  if not exists(select 1 from public.group_members where group_id=p_from and student_id=p_student) then
    raise exception 'Membership unavailable' using errcode='42501';
  end if;
  insert into public.group_members(group_id,student_id) values(p_to,p_student) on conflict do nothing;
  delete from public.group_members where group_id=p_from and student_id=p_student;
end $$;
revoke all on function public.move_managed_student(uuid,uuid,uuid) from public,anon;
grant execute on function public.move_managed_student(uuid,uuid,uuid) to authenticated;

-- Atomic shared rate limiter: the server supplies a hash of the trusted client IP.
create table public.student_auth_limits (
  bucket text primary key check(length(bucket) between 1 and 160),
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.student_auth_limits enable row level security;
revoke all on public.student_auth_limits from public,anon,authenticated;
grant all on public.student_auth_limits to service_role;
create function public.student_auth_take_attempt(p_bucket text) returns boolean
language plpgsql set search_path = '' as $$
declare n integer;
begin
  insert into public.student_auth_limits values(p_bucket,now(),1)
  on conflict(bucket) do update set
    attempts=case when student_auth_limits.window_start < now()-interval '15 minutes' then 1 else student_auth_limits.attempts+1 end,
    window_start=case when student_auth_limits.window_start < now()-interval '15 minutes' then now() else student_auth_limits.window_start end
  returning attempts into n;
  return n <= 10;
end $$;
revoke all on function public.student_auth_take_attempt(text) from public,anon,authenticated;
grant execute on function public.student_auth_take_attempt(text) to service_role;
