-- Stage 5 privileged invitation and review operations. SERVICE ROLE ONLY.
-- An Edge Function MUST authenticate the caller and pass the verified actor ID.
-- Do not expose service_role key to browser; do not use client-supplied actor IDs.
begin;
create function lexigo.issue_invitation(p_actor uuid,p_class uuid,p_role lexigo.member_role,p_ttl_hours integer default 48)
returns text language plpgsql security definer set search_path='' as $$
declare v_token text;
begin
 if p_role not in ('pupil','parent') or p_ttl_hours not between 1 and 168 then
  raise exception 'invalid invitation options' using errcode='22023';
 end if;
 if not lexigo.is_teacher_of(p_class,p_actor) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into lexigo.invitations(class_id,target_role,token_digest,created_by,expires_at)
 values(p_class,p_role,pg_catalog.sha256(pg_catalog.convert_to(v_token,'UTF8')),p_actor,now()+make_interval(hours=>p_ttl_hours));
 insert into lexigo.audit_log(actor_user_id,action,subject_type,subject_id)
 values(p_actor,'invitation.issued','class',p_class);
 return v_token; -- return only once; never log token
end $$;

create function lexigo.redeem_invitation(p_user uuid,p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_inv lexigo.invitations%rowtype; v_role lexigo.member_role;
begin
 if p_token is null or length(p_token)<>64 or p_token !~ '^[0-9a-f]{64}$' then
  raise exception 'invalid invitation' using errcode='22023';
 end if;
 select * into v_inv from lexigo.invitations
 where token_digest=pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')) for update;
 if not found or v_inv.revoked_at is not null or v_inv.redeemed_at is not null
    or v_inv.expires_at<=now() then
  raise exception 'invitation unavailable' using errcode='42501';
 end if;
 select p.role into v_role from lexigo.profiles p join lexigo.classes c on c.id=v_inv.class_id where p.user_id=p_user and p.organization_id=c.organization_id;
 if v_role is distinct from v_inv.target_role then
  raise exception 'role mismatch' using errcode='42501';
 end if;
 -- A parent invitation is NOT proof of parenthood: do not create parent_pupils.
 -- A pupil invitation enrolls only the verified logged-in user, not an arbitrary ID.
 if v_inv.target_role='pupil' then
  insert into lexigo.enrollments(class_id,pupil_user_id,status)
  values(v_inv.class_id,p_user,'active')
  on conflict(class_id,pupil_user_id) do update set status='active';
 end if;
 update lexigo.invitations set redeemed_by=p_user,redeemed_at=now() where id=v_inv.id;
 insert into lexigo.audit_log(actor_user_id,action,subject_type,subject_id)
 values(p_user,'invitation.redeemed','invitation',v_inv.id);
 return v_inv.id;
end $$;

create function lexigo.revoke_invitation(p_actor uuid,p_invitation uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_class uuid;
begin
 select class_id into v_class from lexigo.invitations where id=p_invitation for update;
 if v_class is null or not lexigo.is_teacher_of(v_class,p_actor) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 update lexigo.invitations set revoked_at=now() where id=p_invitation and revoked_at is null;
 insert into lexigo.audit_log(actor_user_id,action,subject_type,subject_id)
 values(p_actor,'invitation.revoked','invitation',p_invitation);
end $$;

create function lexigo.verify_parent_link(p_actor uuid,p_parent uuid,p_pupil uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_ok boolean;
begin
 select exists(select 1 from lexigo.enrollments e where e.pupil_user_id=p_pupil
 and e.status='active' and lexigo.is_teacher_of(e.class_id,p_actor)) into v_ok;
 if not v_ok or not exists(select 1 from lexigo.profiles p join lexigo.profiles child on child.user_id=p_pupil
 where p.user_id=p_parent and p.role='parent' and child.role='pupil' and p.organization_id=child.organization_id) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 insert into lexigo.parent_pupils(parent_user_id,pupil_user_id,verified_by,revoked_at)
 values(p_parent,p_pupil,p_actor,null)
 on conflict(parent_user_id,pupil_user_id) do update
 set verified_by=excluded.verified_by,verified_at=now(),revoked_at=null;
 insert into lexigo.audit_log(actor_user_id,action,subject_type,subject_id)
 values(p_actor,'parent_link.verified','pupil',p_pupil);
end $$;

create function lexigo.revoke_parent_link(p_actor uuid,p_parent uuid,p_pupil uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from lexigo.enrollments e where e.pupil_user_id=p_pupil
 and lexigo.is_teacher_of(e.class_id,p_actor)) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 update lexigo.parent_pupils set revoked_at=now()
 where parent_user_id=p_parent and pupil_user_id=p_pupil and revoked_at is null;
 insert into lexigo.audit_log(actor_user_id,action,subject_type,subject_id)
 values(p_actor,'parent_link.revoked','pupil',p_pupil);
end $$;

create function lexigo.review_attempt(p_actor uuid,p_attempt uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_review uuid;
begin
 if not exists(select 1 from lexigo.attempts t
 join lexigo.assignments a on a.id=t.assignment_id
 where t.id=p_attempt and t.status='finished'
 and lexigo.is_teacher_of(a.class_id,p_actor)
 and lexigo.is_active_pupil(a.class_id,t.pupil_user_id)) then
  raise exception 'not authorized' using errcode='42501';
 end if;
 insert into lexigo.teacher_reviews(attempt_id,teacher_user_id,revoked_at)
 values(p_attempt,p_actor,null)
 on conflict(attempt_id,teacher_user_id) do update
 set reviewed_at=now(),revoked_at=null returning id into v_review;
 insert into lexigo.audit_log(actor_user_id,action,subject_type,subject_id)
 values(p_actor,'attempt.reviewed','attempt',p_attempt);
 return v_review;
end $$;

revoke all on function lexigo.issue_invitation(uuid,uuid,lexigo.member_role,integer),
 lexigo.redeem_invitation(uuid,text),lexigo.revoke_invitation(uuid,uuid),
 lexigo.verify_parent_link(uuid,uuid,uuid),lexigo.revoke_parent_link(uuid,uuid,uuid),
 lexigo.review_attempt(uuid,uuid) from public,anon,authenticated;
grant execute on function lexigo.issue_invitation(uuid,uuid,lexigo.member_role,integer),
 lexigo.redeem_invitation(uuid,text),lexigo.revoke_invitation(uuid,uuid),
 lexigo.verify_parent_link(uuid,uuid,uuid),lexigo.revoke_parent_link(uuid,uuid,uuid),
 lexigo.review_attempt(uuid,uuid) to service_role;
commit;
