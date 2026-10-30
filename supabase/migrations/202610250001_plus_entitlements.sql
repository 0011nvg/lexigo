-- Additive entitlement foundation: existing profiles and learning records are preserved.
begin;
create table lexigo.subscription_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 plan_role text not null check(plan_role in ('student','teacher')),
 trial_started_at timestamptz not null,
 trial_ends_at timestamptz not null,
 paid_until timestamptz,
 canceled_at timestamptz,
 check(trial_ends_at=trial_started_at+interval '14 days')
);
alter table lexigo.subscription_accounts enable row level security;
create policy own_subscription_read on lexigo.subscription_accounts for select to authenticated using(user_id=auth.uid());
grant select on lexigo.subscription_accounts to authenticated;
revoke insert,update,delete on lexigo.subscription_accounts from authenticated,anon;
create table lexigo.subscription_history (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 event text not null,
 occurred_at timestamptz not null default now(),
 details jsonb not null default '{}'
);
alter table lexigo.subscription_history enable row level security;
create policy own_subscription_history on lexigo.subscription_history for select to authenticated using(user_id=auth.uid());
grant select on lexigo.subscription_history to authenticated;
create table lexigo.plan_prices (
 role text not null check(role in ('student','teacher')),
 months integer not null check(months in(1,6)),
 amount_kopecks integer not null check(amount_kopecks>0),
 primary key(role,months)
);
insert into lexigo.plan_prices values ('student',1,4900),('student',6,20900),('teacher',1,9900),('teacher',6,42900);
revoke all on lexigo.plan_prices from anon,authenticated;
-- Provision only from the immutable Auth creation time; no reset on sign-in.
create function lexigo.provision_trial() returns trigger language plpgsql security definer set search_path=pg_catalog,lexigo as $$
begin
 if new.raw_user_meta_data->>'role' in ('student','teacher') then
 insert into lexigo.subscription_accounts(user_id,plan_role,trial_started_at,trial_ends_at)
 values(new.id,new.raw_user_meta_data->>'role',new.created_at,new.created_at+interval '14 days') on conflict do nothing;
 insert into lexigo.subscription_history(user_id,event) values(new.id,'trial_started');
 end if;
 return new;
end $$;
revoke all on function lexigo.provision_trial() from public,anon,authenticated;
create trigger lexigo_trial_after_signup after insert on auth.users for each row execute function lexigo.provision_trial();
create function lexigo.my_entitlement() returns jsonb language sql stable security definer set search_path=pg_catalog,lexigo as $$
 select jsonb_build_object('role',plan_role,'status',case when paid_until>now() then case when canceled_at is not null then 'canceled' else 'active' end when trial_ends_at>now() then 'trialing' when paid_until is not null then 'expired' else 'free' end,'plus',coalesce(paid_until>now(),false) or trial_ends_at>now(),'trialEndsAt',trial_ends_at,'paidUntil',paid_until,'trialEndingSoon',trial_ends_at>now() and trial_ends_at<=now()+interval '3 days') from lexigo.subscription_accounts where user_id=auth.uid()
$$;
revoke all on function lexigo.my_entitlement() from public,anon;
grant execute on function lexigo.my_entitlement() to authenticated;
commit;
