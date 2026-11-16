-- Synthetic Supabase boundary for the offline verifier, not a Supabase export.
-- Real application migrations are applied unchanged after this file.
do $$ begin
  if current_database() <> 'compor_verify'
     or current_user <> 'postgres'
     or current_setting('compor.verification_baseline', true) is distinct from 'synthetic-offline-v1'
     or exists(select 1 from pg_namespace where nspname in ('auth', 'storage', 'vault'))
     or exists(select 1 from pg_tables where schemaname = 'public') then
    raise exception 'refusing non-empty or unguarded verification database';
  end if;
end $$;

create role anon nologin nosuperuser nobypassrls;
create role authenticated nologin nosuperuser nobypassrls;
create role service_role nologin nosuperuser bypassrls;
create role authenticator login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant anon, authenticated, service_role to authenticator;
revoke create on schema public from public;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt()->>'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(auth.jwt()->>'role', '')
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;
revoke all on auth.users from public, anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner uuid,
  owner_id text,
  metadata jsonb,
  version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
-- The application migrations supply all object policies. No allow-all policy.
-- Storage metadata is not evidence that corresponding image bytes exist.

create schema vault;
create table vault.synthetic_secrets (name text not null, decrypted_secret text not null);
create view vault.decrypted_secrets as select name, decrypted_secret from vault.synthetic_secrets;
revoke all on schema vault from public, anon, authenticated, service_role;
revoke all on vault.synthetic_secrets, vault.decrypted_secrets from public, anon, authenticated, service_role;
-- Migration 00028 grants only the fixed SECURITY DEFINER lookup to service_role.
