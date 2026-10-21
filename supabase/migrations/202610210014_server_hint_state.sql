-- Stage 5 incremental hardening: server-owned hint state and replay-safe retry metadata.
-- Local disposable Supabase only; not a production deployment.
begin;
alter table lexigo.attempt_challenges
 add column if not exists hint_count integer not null default 0 check (hint_count between 0 and 1);
create or replace function lexigo.request_challenge_hint(p_actor uuid,p_attempt uuid,p_challenge uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a lexigo.attempts%rowtype; c lexigo.attempt_challenges%rowtype;
begin
 select * into a from lexigo.attempts where id=p_attempt for update;
 if not found or a.pupil_user_id<>p_actor or a.status<>'started'
 or not lexigo.can_see_assignment(a.assignment_id,p_actor) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 select * into c from lexigo.attempt_challenges where id=p_challenge and attempt_id=p_attempt for update;
 if not found or c.answered_at is not null or c.expires_at<=now()
 or c.event_index<>(select coalesce(max(event_index),-1)+1 from lexigo.attempt_events where attempt_id=p_attempt)
 then raise exception 'invalid challenge' using errcode='42501'; end if;
 update lexigo.attempt_challenges set hint_count=1 where id=c.id;
 -- Hint never includes the expected answer or the secret challenge state.
 return pg_catalog.jsonb_build_object('hinted',true,'hint','Compare the prompt carefully; check the meaning and spelling.');
end $$;
revoke all on function lexigo.request_challenge_hint(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function lexigo.request_challenge_hint(uuid,uuid,uuid) to service_role;
commit;
