-- Teacher workspace mutations: verified Edge identity only; no client RPC grants.
begin;
create function lexigo.save_class(p_actor uuid,p_class uuid,p_title text,p_grade integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_id uuid;
begin
 select organization_id into v_org from lexigo.profiles where user_id=p_actor and role='teacher';
 if v_org is null then raise exception 'not authorized' using errcode='42501'; end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 80 or p_grade is null or p_grade not between 2 and 4 then
  raise exception 'invalid class' using errcode='22023'; end if;
 if p_class is null then
  insert into lexigo.classes(organization_id,teacher_user_id,title,grade)
  values(v_org,p_actor,btrim(p_title),p_grade) returning id into v_id;
 else
  perform 1 from lexigo.classes where id=p_class for update;
  if not lexigo.is_teacher_of(p_class,p_actor) then raise exception 'not authorized' using errcode='42501'; end if;
  -- Existing assignments keep their grade/section relationship: rename only.
  if not exists(select 1 from lexigo.classes where id=p_class and grade=p_grade) then
   raise exception 'grade cannot change' using errcode='22023'; end if;
  update lexigo.classes set title=btrim(p_title) where id=p_class;
  v_id:=p_class;
 end if;
 insert into lexigo.audit_log(actor_user_id,action,subject_type,subject_id) values(p_actor,'class.saved','class',v_id);
 return v_id;
end $$;
alter table lexigo.assignments add column revoked_at timestamptz;
create or replace function lexigo.can_see_assignment(p_assignment uuid,p_pupil uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from lexigo.assignments a where a.id=p_assignment
 and a.revoked_at is null and a.due_at>now()
 and lexigo.is_active_pupil(a.class_id,p_pupil)
 and (a.audience_type='class' or exists(select 1 from lexigo.assignment_recipients r
 where r.assignment_id=a.id and r.pupil_user_id=p_pupil)))
$$;
create function lexigo.revoke_assignment(p_actor uuid,p_assignment uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_class uuid;
begin
 select class_id into v_class from lexigo.assignments where id=p_assignment for update;
 if v_class is null or not lexigo.is_teacher_of(v_class,p_actor) then raise exception 'not authorized' using errcode='42501'; end if;
 update lexigo.assignments set revoked_at=coalesce(revoked_at,now()) where id=p_assignment;
 insert into lexigo.audit_log(actor_user_id,action,subject_type,subject_id) values(p_actor,'assignment.revoked','assignment',p_assignment);
 return p_assignment;
end $$;
revoke all on function lexigo.save_class(uuid,uuid,text,integer),lexigo.revoke_assignment(uuid,uuid) from public,anon,authenticated;
grant execute on function lexigo.save_class(uuid,uuid,text,integer),lexigo.revoke_assignment(uuid,uuid) to service_role;
commit;
