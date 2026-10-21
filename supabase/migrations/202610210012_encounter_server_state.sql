-- Server-authoritative encounter state, derived from persisted graded events.
-- Never accept health, crystals, combo or boss damage from the browser.
begin;
alter function lexigo.next_challenge(uuid,uuid) rename to next_challenge_round;
create function lexigo.next_challenge(p_actor uuid,p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb; mode_name text; wins integer; losses integer; rounds integer;
begin
 q:=lexigo.next_challenge_round(p_actor,p_attempt);
 mode_name:=q->>'mode';
 if mode_name in ('pairs','crystals','boss') then
  select count(*) filter(where verified_correct is true),
   count(*) filter(where verified_correct is false),count(*)
  into wins,losses,rounds
  from lexigo.attempt_events
  where attempt_id=p_attempt and verification_source='server_evaluated';
  q:=q || pg_catalog.jsonb_build_object('state',
   pg_catalog.jsonb_build_object('round',rounds+1,'completed',wins,
    'mistakes',losses,'hearts',greatest(0,3-losses),
    'crystals',case when mode_name='crystals' then wins else 0 end,
    'bossHealth',case when mode_name='boss' then greatest(0,3-wins) else null end,
    'phase',rounds%3));
 end if;
 return q;
end $$;
revoke all on function lexigo.next_challenge_round(uuid,uuid),
 lexigo.next_challenge(uuid,uuid) from public,anon,authenticated;
grant execute on function lexigo.next_challenge_round(uuid,uuid),
 lexigo.next_challenge(uuid,uuid) to service_role;
commit;
