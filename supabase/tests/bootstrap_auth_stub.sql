-- Disposable PostgreSQL 16 stand-in for Supabase Auth in CI ONLY.
-- Never apply to a real Supabase instance: it already owns auth.*.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
 id uuid primary key,
 instance_id uuid not null,
 aud text,
 role text,
 email text unique,
 encrypted_password text,
 email_confirmed_at timestamptz,
 created_at timestamptz,
 updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated,service_role;
grant execute on function auth.uid() to authenticated,service_role;
