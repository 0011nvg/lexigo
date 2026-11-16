create table public.student_identity_keys (
 id integer primary key check(id=1), private_jwk jsonb not null, public_jwk jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.student_identity_keys enable row level security;
revoke all on public.student_identity_keys from public,anon,authenticated;
grant all on public.student_identity_keys to service_role;
