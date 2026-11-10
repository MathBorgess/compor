-- Preparation only: no key is created, copied or enabled by this migration.
-- The operator provisions the fixed name in Supabase Vault separately.
create or replace function public.compor_default_openai_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_matches bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'not_authorized';
  end if;

  -- A prepared deployment remains usable with BYOK before Vault is enabled.
  -- PL/pgSQL resolves the view only when this branch is actually executed.
  begin
    if pg_catalog.to_regclass('vault.decrypted_secrets') is null then
      return null;
    end if;
    select pg_catalog.count(*), pg_catalog.min(s.decrypted_secret)
      into v_matches, v_key
      from vault.decrypted_secrets as s
      where s.name = 'COMPOR_CIN_OPENAI';
    if v_matches <> 1 or v_key is null or pg_catalog.length(v_key) not between 23 and 303
      or v_key !~ '^sk-[^[:space:]]+$' then
      return null;
    end if;
    return v_key;
  exception when others then
    -- Do not expose Vault errors or decrypted data through PostgREST errors.
    return null;
  end;
end;
$$;

revoke all on function public.compor_default_openai_key() from public, anon, authenticated;
grant execute on function public.compor_default_openai_key() to service_role;

comment on function public.compor_default_openai_key() is
  'Server-only lookup of the fixed Compor OpenAI secret; no browser or authenticated-user execution.';
