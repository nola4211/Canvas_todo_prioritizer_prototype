-- Local-only OAuth denial smoke test. Run after applying the MCP migration to
-- a disposable local Supabase database. This uses a synthetic, non-existent
-- subject and client ID; it does not create data or contact the hosted project.
begin;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',(select jsonb_build_object(
  'sub','00000000-0000-4000-8000-0000000000a1',
  'role','authenticated',
  'client_id','synthetic-oauth-client',
  'iss',oauth_issuer,
  'aud',canonical_resource
)::text from public.student_agent_runtime_config where singleton),true);
set local role authenticated;

-- All authenticated-readable tables and views must produce no rows for this
-- OAuth token, even where a matching permissive owner/public policy exists.
do $$
declare r record; v_count bigint;
begin
  for r in
    select n.nspname,c.relname,c.relkind
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v')
      and pg_catalog.has_any_column_privilege('authenticated',c.oid,'select')
  loop
    execute format('select count(*) from %I.%I',r.nspname,r.relname) into v_count;
    if v_count<>0 then raise exception 'OAuth direct-read leak: %.% returned % rows',r.nspname,r.relname,v_count; end if;
  end loop;
  for r in
    select n.nspname,c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='storage' and c.relkind in ('r','p')
      and pg_catalog.has_any_column_privilege('authenticated',c.oid,'select')
  loop
    execute format('select count(*) from %I.%I',r.nspname,r.relname) into v_count;
    if v_count<>0 then raise exception 'OAuth Storage-read leak: %.% returned % rows',r.nspname,r.relname,v_count; end if;
  end loop;
end $$;

-- A raw MCP RPC without an active owner/client approval must fail closed.
do $$
declare v_result jsonb;
begin
  v_result:=public.student_mcp_get_workspace_context();
  if v_result->>'error_code' is distinct from 'ACCESS_REVOKED' then
    raise exception 'Expected ACCESS_REVOKED, received %',v_result;
  end if;
end $$;

-- Existing browser-only public RPCs remain callable by normal users but reject
-- delegated OAuth tokens before their private implementation runs.
do $$
begin
  begin
    perform public.create_ai_chat('synthetic OAuth denial check');
    raise exception 'OAuth token unexpectedly reached create_ai_chat';
  exception when others then
    if position('DELEGATED_TOKEN_BLOCKED' in sqlerrm)=0 then raise; end if;
  end;
end $$;

rollback;
