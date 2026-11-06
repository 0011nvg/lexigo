-- Additional private account data. Existing lessons, sessions and word_progress are unchanged.
begin;
create table if not exists public.account_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key in (
    'lexigo_my_class_v1','lexigo_fav_modules_v1','lexigo_last_activity_v1',
    'lexigo_hard_words_v1','lexigo_word_selection_v1','lexigo_boss_types_v1',
    'lexigo_shared_done_v1','lexigo_ws_custom_v1','lexigo_lesson_draft_v1')),
  value jsonb not null check (octet_length(value::text) <= 500000),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.account_state enable row level security;
revoke all on public.account_state from anon, authenticated;
grant select on public.account_state to authenticated;
drop policy if exists account_state_own on public.account_state;
create policy account_state_own on public.account_state for select to authenticated
  using (user_id = auth.uid());

-- Compare-and-set prevents a stale device from silently overwriting a newer cloud value.
-- JSON null is a tombstone: deleted drafts/settings cannot reappear on another device.
create or replace function public.save_account_state(p_key text, p_value jsonb, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); saved public.account_state;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_revision is null or p_revision < 0 or p_value is null then raise exception 'invalid state'; end if;
  if p_revision = 0 then
    insert into public.account_state(user_id, key, value) values (uid, p_key, p_value)
      on conflict (user_id, key) do nothing returning * into saved;
  else
    update public.account_state set value = p_value, revision = revision + 1, updated_at = now()
      where user_id = uid and key = p_key and revision = p_revision returning * into saved;
  end if;
  if found then return jsonb_build_object('saved', true, 'row', to_jsonb(saved)); end if;
  select * into saved from public.account_state where user_id = uid and key = p_key;
  return jsonb_build_object('saved', false, 'row', to_jsonb(saved));
end $$;
revoke all on function public.save_account_state(text,jsonb,bigint) from public, anon;
grant execute on function public.save_account_state(text,jsonb,bigint) to authenticated;
commit;
