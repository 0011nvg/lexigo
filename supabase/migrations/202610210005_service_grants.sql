-- Trusted server needs explicit table and sequence privileges even with BYPASSRLS.
-- PostgREST can expose only lexigo RPC endpoints; table grants for service_role
-- never grant access to anon/authenticated.
begin;
grant usage on schema lexigo to service_role;
grant all privileges on all tables in schema lexigo to service_role;
grant usage,select on all sequences in schema lexigo to service_role;
commit;
