-- DRAFT FOR ISOLATED TESTS ONLY. This is intentionally NOT a deployable migration.
-- Do not enable before answer-history PR #19, consent, delivery security and
-- offline-activity guarantees are reviewed and tested on real Supabase.
begin;
do $$ begin
 if current_setting('lexi.push_isolated_test_only', true) is distinct from 'YES' then
  raise exception 'push draft blocked: isolated-test opt-in required';
 end if;
end $$;

create table if not exists public.push_subscriptions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null,
  endpoint text not null unique check (char_length(endpoint) <= 2048 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[A-Za-z0-9._~!$&''()*+,;=:@%/?-]+$'),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth_secret text not null check (auth_secret ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);
create table if not exists public.push_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  assignments_enabled boolean not null default false,
  daily_enabled boolean not null default false,
  daily_time time not null default '19:00',
  timezone text not null default 'Europe/Moscow' check (timezone = 'Europe/Moscow'),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
alter table public.push_preferences enable row level security;
revoke all on public.push_subscriptions, public.push_preferences from public, anon, authenticated;
-- The browser never SELECTs push secrets. Access is through narrowly scoped RPCs.
-- Service credentials must remain server-only and be held by a trusted worker.
grant select on public.push_subscriptions, public.push_preferences to service_role;

create or replace function public.push_save_subscription(p_expected_user uuid, p_device_id uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
 if uid is null or uid is distinct from p_expected_user then raise exception 'account changed' using errcode='42501'; end if;
 if p_device_id is null then raise exception 'missing device id' using errcode='22023'; end if;
 -- Serialize device limit checks for the same account.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 287136));
 if (select count(*) from public.push_subscriptions where user_id=uid) >= 20
    and not exists(select 1 from public.push_subscriptions where user_id=uid and device_id=p_device_id) then
  raise exception 'device limit reached' using errcode='22023';
 end if;
 insert into public.push_subscriptions(user_id,device_id,endpoint,p256dh,auth_secret)
 values(uid,p_device_id,p_endpoint,p_p256dh,p_auth)
 on conflict (user_id,device_id) do update set endpoint=excluded.endpoint,p256dh=excluded.p256dh,
   auth_secret=excluded.auth_secret,updated_at=now();
end $$;
create or replace function public.push_remove_subscription(p_expected_user uuid, p_device_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or auth.uid() is distinct from p_expected_user then raise exception 'account changed' using errcode='42501'; end if;
 delete from public.push_subscriptions where user_id=auth.uid() and device_id=p_device_id;
end $$;
create or replace function public.push_save_preferences(p_expected_user uuid, p_assignments boolean, p_daily boolean, p_time time)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or auth.uid() is distinct from p_expected_user then raise exception 'account changed' using errcode='42501'; end if;
 if p_assignments is null or p_daily is null or p_time is null then raise exception 'missing preferences' using errcode='22023'; end if;
 -- Daily reminder delivery MUST remain disabled until confirmed history and
 -- offline/late-arriving events can be handled without false reminders.
 if p_daily then raise exception 'daily reminders unavailable' using errcode='55000'; end if;
 insert into public.push_preferences(user_id,assignments_enabled,daily_enabled,daily_time)
 values(auth.uid(),p_assignments,false,p_time)
 on conflict (user_id) do update set assignments_enabled=excluded.assignments_enabled,daily_enabled=false,
 daily_time=excluded.daily_time,updated_at=now();
end $$;
create or replace function public.push_my_settings(p_expected_user uuid, p_device_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
 if uid is null or uid is distinct from p_expected_user then raise exception 'account changed' using errcode='42501'; end if;
 return jsonb_build_object('device_subscribed',exists(select 1 from public.push_subscriptions where user_id=uid and device_id=p_device_id),
  'assignments_enabled',coalesce((select assignments_enabled from public.push_preferences where user_id=uid),false),
  'daily_enabled',false,'daily_time',coalesce((select daily_time::text from public.push_preferences where user_id=uid),'19:00:00'),
  'timezone','Europe/Moscow');
end $$;

-- Server-only candidate lookup, not a delivery instruction. Future worker must
-- recheck recipient membership and consent immediately before every send.
create or replace function public.push_assignment_recipients(p_assignment uuid)
returns table(user_id uuid, device_id uuid, endpoint text, p256dh text, auth_secret text)
language sql stable security definer set search_path = '' as $$
 select m.student_id,s.device_id,s.endpoint,s.p256dh,s.auth_secret
 from public.assignments a
 join public.groups g on g.id=a.group_id and g.teacher_id=a.teacher_id
 join public.group_members m on m.group_id=g.id and (a.student_id is null or a.student_id=m.student_id)
 join public.profiles p on p.id=m.student_id and p.role='student'
 join public.push_preferences pref on pref.user_id=m.student_id and pref.assignments_enabled
 join public.push_subscriptions s on s.user_id=m.student_id
 where a.id=p_assignment
$$;
revoke all on function public.push_save_subscription(uuid,uuid,text,text,text),
 public.push_remove_subscription(uuid,uuid),public.push_save_preferences(uuid,boolean,boolean,time),
 public.push_my_settings(uuid,uuid),public.push_assignment_recipients(uuid) from public, anon, authenticated;
grant execute on function public.push_save_subscription(uuid,uuid,text,text,text),
 public.push_remove_subscription(uuid,uuid),public.push_save_preferences(uuid,boolean,boolean,time),
 public.push_my_settings(uuid,uuid) to authenticated;
grant execute on function public.push_assignment_recipients(uuid) to service_role;
commit;
