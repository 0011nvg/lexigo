-- Stage 5: explicit access revocation, service role only.
-- Invitation revocation alone does NOT revoke an already redeemed enrollment.
begin;
create function lexigo.revoke_enrollment(p_actor uuid,p_class uuid,p_pupil uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not lexigo.is_teacher_of(p_class,p_actor) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 update lexigo.enrollments set status='revoked'
 where class_id=p_class and pupil_user_id=p_pupil and status='active';
 -- Invitations are class-wide bearer tokens, not tied to a named pupil.
 -- Invalidate all unused pupil tokens for the class to prevent immediate re-enrollment.
 update lexigo.invitations set revoked_at=now()
 where class_id=p_class and target_role='pupil' and redeemed_at is null and revoked_at is null;
 insert into lexigo.audit_log(actor_user_id,action,subject_type,subject_id)
 values(p_actor,'enrollment.revoked','pupil',p_pupil);
end $$;

create function lexigo.revoke_teacher_review(p_actor uuid,p_attempt uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from lexigo.attempts t
 join lexigo.assignments a on a.id=t.assignment_id
 where t.id=p_attempt and lexigo.is_teacher_of(a.class_id,p_actor)) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 update lexigo.teacher_reviews set revoked_at=now()
 where attempt_id=p_attempt and teacher_user_id=p_actor and revoked_at is null;
 insert into lexigo.audit_log(actor_user_id,action,subject_type,subject_id)
 values(p_actor,'attempt.review_revoked','attempt',p_attempt);
end $$;

revoke all on function lexigo.revoke_enrollment(uuid,uuid,uuid),
 lexigo.revoke_teacher_review(uuid,uuid) from public,anon,authenticated;
grant execute on function lexigo.revoke_enrollment(uuid,uuid,uuid),
 lexigo.revoke_teacher_review(uuid,uuid) to service_role;
commit;
