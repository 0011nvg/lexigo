-- Required after managed_student_credentials, before enabling student-accounts.
alter table public.managed_students add column identity_subject uuid not null default gen_random_uuid() unique;
