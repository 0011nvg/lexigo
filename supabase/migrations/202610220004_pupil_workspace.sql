begin;
-- Keep challenge issuance and its attempt lock; project only safe current state.
alter function lexigo.next_challenge(uuid,uuid) rename to issue_challenge_internal;
revoke all on function lexigo.issue_challenge_internal(uuid,uuid) from public,anon,authenticated,service_role;
create function lexigo.next_challenge(p_actor uuid,p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; ch lexigo.attempt_challenges%rowtype; q jsonb; state jsonb;
begin
 result:=lexigo.issue_challenge_internal(p_actor,p_attempt);
 select * into ch from lexigo.attempt_challenges where id=(result->>'challengeId')::uuid;
 q:=ch.payload;state:=ch.private_state;
 if ch.mode='pairs' then
  q:=q||jsonb_build_object('matched',coalesce(state->'matched','[]'::jsonb));
 elsif ch.mode='crystals' then
  q:=q||jsonb_build_object('board',state->'board','moves',state->'moves',
   'boardComplete',coalesce((state->>'moves')::integer,0)>=7);
 elsif ch.mode='boss' then
  q:=q||jsonb_build_object('question',state->'stages'->coalesce((state->>'phase')::integer,0)->'question',
   'lives',state->'lives','phase',state->'phase','retryRequired',state->>'retry'='1');
 end if;
 return jsonb_set(result,'{question}',q);
end $$;
revoke all on function lexigo.next_challenge(uuid,uuid) from public,anon,authenticated;
grant execute on function lexigo.next_challenge(uuid,uuid) to service_role;

-- Read-only history survives deadlines/revocation; membership revocation still removes it.
create function lexigo.can_read_own_history(p_assignment uuid,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from lexigo.assignments a where a.id=p_assignment
 and lexigo.is_active_pupil(a.class_id,p_actor)
 and exists(select 1 from lexigo.attempts t where t.assignment_id=a.id and t.pupil_user_id=p_actor))
$$;
revoke all on function lexigo.can_read_own_history(uuid,uuid) from public,anon;
grant execute on function lexigo.can_read_own_history(uuid,uuid) to authenticated,service_role;
create policy pupil_assignment_history on lexigo.assignments for select to authenticated
 using(lexigo.can_read_own_history(id,(select auth.uid())));
create policy pupil_attempt_history on lexigo.attempts for select to authenticated
 using(pupil_user_id=(select auth.uid()) and lexigo.can_read_own_history(assignment_id,(select auth.uid())));
commit;
