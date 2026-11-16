-- Run as the database administrator; fixtures and rate-limit counters are rolled back.
begin;
do $$
declare
 t1 uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
 g1 uuid:=gen_random_uuid(); g2 uuid:=gen_random_uuid(); foreign_g uuid:=gen_random_uuid();
 hash text:='pbkdf2-sha256$600000$abcdefghijklmnopqrstuv$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
 rejected boolean;
begin
 if has_table_privilege('anon','public.managed_student_secrets','select')
    or has_table_privilege('authenticated','public.managed_student_secrets','select') then
   raise exception 'Browser role can read password hashes';
 end if;
 if has_function_privilege('authenticated','public.register_managed_student(uuid,uuid,uuid,text,text)','execute')
    or has_function_privilege('anon','public.student_auth_take_attempt(text)','execute') then
   raise exception 'Privileged function exposed';
 end if;
 insert into auth.users(id,raw_user_meta_data) values
 (t1,'{"role":"teacher","display_name":"Managed account test"}'),
 (t2,'{"role":"teacher","display_name":"Managed account test"}'),
 (s,'{"role":"student","display_name":"Managed account test"}');
 insert into public.groups(id,teacher_id,name,join_code) values
 (g1,t1,'Test source','TESTAA23'),(g2,t1,'Test destination','TESTAA24'),(foreign_g,t2,'Test foreign','TESTAA25');
 rejected:=false;
 begin
   perform public.register_managed_student(t2,s,g1,'teststudent23',hash);
 exception when insufficient_privilege then rejected:=true;
 end;
 if not rejected then raise exception 'Foreign teacher allowed registration'; end if;
 perform public.register_managed_student(t1,s,g1,'teststudent23',hash);
 if not exists(select 1 from public.group_members where group_id=g1 and student_id=s) then
   raise exception 'Class membership missing';
 end if;
 perform set_config('request.jwt.claim.sub',t1::text,true);
 perform public.move_managed_student(s,g1,g2);
 if exists(select 1 from public.group_members where group_id=g1 and student_id=s)
 or not exists(select 1 from public.group_members where group_id=g2 and student_id=s) then
   raise exception 'Move failed';
 end if;
 if not exists(select 1 from public.user_stats where user_id=s) then raise exception 'Student stats removed'; end if;
 rejected:=false;
 begin
   perform public.move_managed_student(s,g2,foreign_g);
 exception when insufficient_privilege then rejected:=true;
 end;
 if not rejected then raise exception 'Move into foreign class allowed'; end if;
 perform set_config('request.jwt.claim.sub',t2::text,true);
 rejected:=false;
 begin
   perform public.move_managed_student(s,g2,g1);
 exception when insufficient_privilege then rejected:=true;
 end;
 if not rejected then raise exception 'Foreign teacher can move student'; end if;
 for i in 1..10 loop
   if not public.student_auth_take_attempt('test:'||s::text) then raise exception 'Rate limit too early'; end if;
 end loop;
 if public.student_auth_take_attempt('test:'||s::text) then raise exception 'Rate limit failed'; end if;
end $$;
rollback;
