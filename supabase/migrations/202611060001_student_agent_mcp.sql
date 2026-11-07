-- Student agent MCP. Apply only after reviewing docs/student-agent-mcp-security.md.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Retain these implementations privately and expose only browser-guarded wrappers.
alter function public.valid_priority_rules(jsonb) set schema private;
revoke all on function private.valid_priority_rules(jsonb) from public, anon, authenticated;
grant execute on function private.valid_priority_rules(jsonb) to authenticated;
alter function public.create_saved_assignment(text,text,date,integer,boolean,numeric,uuid,boolean,boolean,text) set schema private;
alter function private.create_saved_assignment(text,text,date,integer,boolean,numeric,uuid,boolean,boolean,text) rename to create_saved_assignment_core;
revoke all on function private.create_saved_assignment_core(text,text,date,integer,boolean,numeric,uuid,boolean,boolean,text) from public, anon, authenticated;

alter function public.create_ai_chat(text) set schema private;
alter function private.create_ai_chat(text) rename to create_ai_chat_browser_core;
alter function public.begin_ai_turn(bigint,uuid,text) set schema private;
alter function private.begin_ai_turn(bigint,uuid,text) rename to begin_ai_turn_browser_core;
alter function public.confirm_ai_assignment(bigint,uuid,boolean) set schema private;
alter function private.confirm_ai_assignment(bigint,uuid,boolean) rename to confirm_ai_assignment_browser_core;
alter function public.change_ai_assignment_draft(bigint,uuid,text) set schema private;
alter function private.change_ai_assignment_draft(bigint,uuid,text) rename to change_ai_assignment_draft_browser_core;
alter function public.name_ai_chat(bigint,text) set schema private;
alter function private.name_ai_chat(bigint,text) rename to name_ai_chat_browser_core;
alter function public.record_app_open() set schema private;
alter function private.record_app_open() rename to record_app_open_browser_core;
alter function public.get_weekly_engagement_okr() set schema private;
alter function private.get_weekly_engagement_okr() rename to get_weekly_engagement_okr_browser_core;
alter function public.reserve_ai_time_suggestion() set schema private;
alter function private.reserve_ai_time_suggestion() rename to reserve_ai_time_suggestion_browser_core;
alter function public.remove_saved_assignment(bigint) set schema private;
alter function private.remove_saved_assignment(bigint) rename to remove_saved_assignment_browser_core;
revoke all on function private.create_ai_chat_browser_core(text),private.begin_ai_turn_browser_core(bigint,uuid,text),
  private.confirm_ai_assignment_browser_core(bigint,uuid,boolean),private.change_ai_assignment_draft_browser_core(bigint,uuid,text),
  private.name_ai_chat_browser_core(bigint,text),private.record_app_open_browser_core(),private.get_weekly_engagement_okr_browser_core(),
  private.reserve_ai_time_suggestion_browser_core(),private.remove_saved_assignment_browser_core(bigint)
from public,anon,authenticated;

create table public.student_agent_runtime_config (
  singleton boolean primary key default true check(singleton),
  canonical_resource text not null,
  oauth_issuer text not null,
  updated_at timestamptz not null default now()
);
insert into public.student_agent_runtime_config(singleton,canonical_resource,oauth_issuer) values
(true,'https://uowlwdwrqceklbqjcnmc.supabase.co/functions/v1/student-mcp','https://uowlwdwrqceklbqjcnmc.supabase.co/auth/v1');
alter table public.student_agent_runtime_config enable row level security;
revoke all on public.student_agent_runtime_config from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant select on public.student_agent_runtime_config to supabase_auth_admin;
create policy student_agent_auth_hook_config on public.student_agent_runtime_config for select to supabase_auth_admin using(true);

create table public.student_agent_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check(client_id=btrim(client_id) and char_length(client_id) between 1 and 200),
  client_name text not null default 'Connected agent' check(char_length(client_name) between 1 and 200),
  permission_bundle jsonb not null default '{"read_tasks":true,"create_tasks":true,"update_completion":true,"manage_study_sessions":true}'::jsonb
    check(permission_bundle='{"read_tasks":true,"create_tasks":true,"update_completion":true,"manage_study_sessions":true}'::jsonb),
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(owner_id,client_id)
);
create index student_agent_grants_active on public.student_agent_grants(owner_id,client_id) where revoked_at is null;
alter table public.student_agent_grants enable row level security;
revoke all on public.student_agent_grants from public,anon,authenticated;

create table public.student_agent_rate_limits (
  owner_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  tool_calls integer not null default 0 check(tool_calls between 0 and 61),
  write_calls integer not null default 0 check(write_calls between 0 and 21),
  primary key(owner_id,window_start)
);
alter table public.student_agent_rate_limits enable row level security;
revoke all on public.student_agent_rate_limits from public,anon,authenticated;

create extension if not exists btree_gist with schema extensions;
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  assignment_id bigint not null references public.assignments(assignment_id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Denver',
  version integer not null default 1 check(version>0),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint study_sessions_duration check(ends_at>starts_at and ends_at-starts_at between interval '5 minutes' and interval '8 hours'),
  constraint study_sessions_owner_request unique(owner_id,client_request_id),
  constraint study_sessions_no_overlap exclude using gist
    (owner_id with =,tstzrange(starts_at,ends_at,'[)') with &&) where(cancelled_at is null)
);
create index study_sessions_owner_time on public.study_sessions(owner_id,starts_at,id);
alter table public.study_sessions enable row level security;
revoke all on public.study_sessions from public,anon,authenticated;
grant select on public.study_sessions to authenticated;
create policy study_sessions_owner_read on public.study_sessions for select to authenticated using(owner_id=(select auth.uid()));

-- Restrictive policies AND with current permissive policies; they preserve
-- browser access while rejecting every token that contains the OAuth client_id claim.
do $$
declare t record;
begin
  for t in select c.oid,c.relname,c.relrowsecurity from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
      and (pg_catalog.has_any_column_privilege('authenticated',c.oid,'select') or pg_catalog.has_any_column_privilege('authenticated',c.oid,'insert')
        or pg_catalog.has_any_column_privilege('authenticated',c.oid,'update') or pg_catalog.has_table_privilege('authenticated',c.oid,'delete'))
  loop
    if not t.relrowsecurity then raise exception 'Review required: public.% has authenticated grants but RLS is disabled',t.relname; end if;
    execute format('create policy student_agent_no_oauth on public.%I as restrictive for all to authenticated using(not coalesce((auth.jwt() ? ''client_id''),false)) with check(not coalesce((auth.jwt() ? ''client_id''),false))',t.relname);
  end loop;
end $$;

-- Owner-executed views would bypass base-table RLS. Switch granted views to
-- invoker rights; stop if a materialized view is directly readable.
do $$
declare v record;
begin
  if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='m' and pg_catalog.has_any_column_privilege('authenticated',c.oid,'select')) then
    raise exception 'Review required: an authenticated materialized view has no RLS boundary';
  end if;
  for v in select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v' and pg_catalog.has_any_column_privilege('authenticated',c.oid,'select')
  loop execute format('alter view public.%I set(security_invoker=true)',v.relname); end loop;
end $$;

-- Storage tables with no applicable permissive policy already deny every row.
-- Some managed Storage tables cannot be altered by the project postgres role.
-- Do not alter those default-deny tables. Any future permissive Storage policy
-- must be paired with the OAuth restriction before enabling browser access.
-- Tables that already allow browser access must accept the restriction or abort.
do $$
declare t record;
begin
  for t in select c.oid,c.relname,c.relrowsecurity from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='storage' and c.relkind in ('r','p')
      and (pg_catalog.has_any_column_privilege('authenticated',c.oid,'select') or pg_catalog.has_any_column_privilege('authenticated',c.oid,'insert')
        or pg_catalog.has_any_column_privilege('authenticated',c.oid,'update') or pg_catalog.has_table_privilege('authenticated',c.oid,'delete'))
  loop
    if not t.relrowsecurity then raise exception 'Review required: storage.% has authenticated grants but RLS is disabled',t.relname; end if;
    if not exists (
      select 1 from pg_catalog.pg_policy p where p.polrelid=t.oid and p.polpermissive
        and exists(select 1 from unnest(p.polroles) r(role_oid)
          where r.role_oid=0 or pg_catalog.pg_has_role('authenticated',r.role_oid,'USAGE'))
    ) then continue; end if;
    execute format('create policy student_agent_no_oauth on storage.%I as restrictive for all to authenticated using(not coalesce((auth.jwt() ? ''client_id''),false)) with check(not coalesce((auth.jwt() ? ''client_id''),false))',t.relname);
  end loop;
end $$;

create or replace function private.assert_browser_session() returns void
language plpgsql set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'REAUTH_REQUIRED'; end if;
  if coalesce(auth.jwt() ? 'client_id',false) then raise exception 'DELEGATED_TOKEN_BLOCKED'; end if;
end $$;

create or replace function private.consume_student_agent_rate(p_owner uuid,p_is_write boolean) returns boolean
language plpgsql set search_path='' as $$
declare v_window timestamptz:=date_trunc('minute',statement_timestamp()); v_tools integer; v_writes integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||v_window::text,0));
  delete from public.student_agent_rate_limits where owner_id=p_owner and window_start<v_window-interval '1 day';
  insert into public.student_agent_rate_limits as current_limit(owner_id,window_start,tool_calls,write_calls)
    values(p_owner,v_window,1,case when p_is_write then 1 else 0 end)
  on conflict(owner_id,window_start) do update set
    tool_calls=least(current_limit.tool_calls+1,61),
    write_calls=least(current_limit.write_calls+case when p_is_write then 1 else 0 end,21)
  returning tool_calls,write_calls into v_tools,v_writes;
  return v_tools<=60 and (not p_is_write or v_writes<=20);
end $$;

create or replace function private.student_mcp_preflight(p_capability text,p_is_write boolean) returns text
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_client text:=nullif(auth.jwt()->>'client_id',''); v_expected_aud text; v_expected_iss text; v_allowed boolean;
begin
  if v_owner is null or v_client is null then return 'REAUTH_REQUIRED'; end if;
  select canonical_resource,oauth_issuer into v_expected_aud,v_expected_iss from public.student_agent_runtime_config where singleton;
  if auth.jwt()->>'iss' is distinct from v_expected_iss or auth.jwt()->>'aud' is distinct from v_expected_aud then return 'REAUTH_REQUIRED'; end if;
  select coalesce(permission_bundle->>p_capability,'false')='true' into v_allowed
    from public.student_agent_grants where owner_id=v_owner and client_id=v_client and revoked_at is null;
  if coalesce(v_allowed,false) is not true then return 'ACCESS_REVOKED'; end if;
  if not private.consume_student_agent_rate(v_owner,p_is_write) then return 'RATE_LIMITED'; end if;
  return null;
end $$;

create or replace function private.student_mcp_error(p_code text) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('ok',false,'error_code',p_code,'message',case p_code
    when 'VALIDATION_ERROR' then 'Check the supplied assignment, time, and timezone values.'
    when 'NOT_FOUND' then 'The requested record was not found.'
    when 'CONFLICT' then 'The record changed, or this request ID was used with different details.'
    when 'SCHEDULE_OVERLAP' then 'This time overlaps another active study session.'
    when 'REAUTH_REQUIRED' then 'Reconnect this agent to continue.'
    when 'ACCESS_REVOKED' then 'This agent is disconnected. Reconnect it from app settings.'
    when 'RATE_LIMITED' then 'The agent has reached its per-minute limit. Try again shortly.'
    else 'The app could not complete that request.' end);
$$;

create or replace function private.student_mcp_exception_code(p_state text,p_message text) returns text
language sql immutable set search_path='' as $$
  select case when p_state='23P01' then 'SCHEDULE_OVERLAP'
    when p_state='23505' or p_message='CONFLICT' or p_message like 'This request ID belongs to different assignment details%' then 'CONFLICT'
    when p_state='P0002' or p_message='NOT_FOUND' then 'NOT_FOUND'
    when p_message in ('ACCESS_REVOKED','REAUTH_REQUIRED','RATE_LIMITED') then p_message
    else 'VALIDATION_ERROR' end;
$$;

create or replace function private.student_session_json(p_owner uuid,p_session_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',s.id::text,'assignment_id',s.assignment_id::text,'assignment_title',a.name,
    'starts_at',s.starts_at,'ends_at',s.ends_at,'timezone',s.timezone,'version',s.version,
    'created_at',s.created_at,'updated_at',s.updated_at,'cancelled_at',s.cancelled_at)
  from public.study_sessions s join public.assignments a on a.assignment_id=s.assignment_id
  where s.id=p_session_id and s.owner_id=p_owner and a.owner_id=p_owner and a.deleted=false;
$$;

-- Shared validation and persistence for browser UI and agent calls.
create or replace function private.save_student_study_session(
  p_owner uuid,p_assignment_id bigint,p_starts_at timestamptz,p_ends_at timestamptz,p_timezone text,
  p_client_request_id uuid,p_allow_after_due boolean,p_session_id uuid default null,p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_existing public.study_sessions; v_saved public.study_sessions; v_due timestamptz; v_after_due boolean:=false;
begin
  begin
    if p_owner is null or p_owner is distinct from auth.uid() then raise exception 'REAUTH_REQUIRED'; end if;
    if p_assignment_id is null or p_starts_at is null or p_ends_at is null or p_timezone is null then raise exception 'VALIDATION_ERROR'; end if;
    if p_session_id is null then
      if p_client_request_id is null then raise exception 'VALIDATION_ERROR'; end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||p_client_request_id::text,0));
      select * into v_existing from public.study_sessions where owner_id=p_owner and client_request_id=p_client_request_id for update;
      if found then
        if v_existing.assignment_id is distinct from p_assignment_id or v_existing.starts_at is distinct from p_starts_at
          or v_existing.ends_at is distinct from p_ends_at or v_existing.timezone is distinct from p_timezone then raise exception 'CONFLICT'; end if;
        select due_date into v_due from public.assignments where assignment_id=v_existing.assignment_id and owner_id=p_owner and deleted=false;
        v_after_due:=v_due is not null and v_existing.ends_at>v_due;
        if v_after_due and p_allow_after_due is not true then raise exception 'VALIDATION_ERROR'; end if;
        return jsonb_build_object('ok',true,'data',private.student_session_json(p_owner,v_existing.id),
          'warnings',case when v_after_due then jsonb_build_array('SESSION_AFTER_DUE') else '[]'::jsonb end);
      end if;
    else
      if p_expected_version is null or p_expected_version<1 then raise exception 'VALIDATION_ERROR'; end if;
      select * into v_existing from public.study_sessions where id=p_session_id and owner_id=p_owner for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      if v_existing.cancelled_at is not null then raise exception 'CONFLICT'; end if;
      if v_existing.version<>p_expected_version then raise exception 'CONFLICT'; end if;
    end if;
    if p_starts_at<=statement_timestamp() or p_ends_at<=p_starts_at
      or p_ends_at-p_starts_at<interval '5 minutes' or p_ends_at-p_starts_at>interval '8 hours' then raise exception 'VALIDATION_ERROR'; end if;
    if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'VALIDATION_ERROR'; end if;
    select due_date into v_due from public.assignments where assignment_id=p_assignment_id and owner_id=p_owner and deleted=false;
    if not found then raise exception 'NOT_FOUND'; end if;
    -- Assignments store their due date as the corresponding 11:59 PM Denver
    -- timestamp, so compare the actual stored deadline without a timezone cast.
    v_after_due:=v_due is not null and p_ends_at>v_due;
    if v_after_due and p_allow_after_due is not true then raise exception 'VALIDATION_ERROR'; end if;
    if p_session_id is null then
      insert into public.study_sessions(owner_id,assignment_id,starts_at,ends_at,timezone,client_request_id)
        values(p_owner,p_assignment_id,p_starts_at,p_ends_at,p_timezone,p_client_request_id) returning * into v_saved;
    else
      update public.study_sessions set assignment_id=p_assignment_id,starts_at=p_starts_at,ends_at=p_ends_at,
        timezone=p_timezone,version=version+1,updated_at=statement_timestamp()
        where id=p_session_id and owner_id=p_owner returning * into v_saved;
    end if;
    return jsonb_build_object('ok',true,'data',private.student_session_json(p_owner,v_saved.id),
      'warnings',case when v_after_due then jsonb_build_array('SESSION_AFTER_DUE') else '[]'::jsonb end);
  exception when others then
    return private.student_mcp_error(private.student_mcp_exception_code(SQLSTATE,SQLERRM));
  end;
end $$;

create or replace function private.cancel_student_study_session(p_owner uuid,p_session_id uuid,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_existing public.study_sessions;
begin
  begin
    if p_owner is null or p_owner is distinct from auth.uid() or p_session_id is null or p_expected_version is null or p_expected_version<1 then raise exception 'VALIDATION_ERROR'; end if;
    select * into v_existing from public.study_sessions where id=p_session_id and owner_id=p_owner for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_existing.cancelled_at is not null then return jsonb_build_object('ok',true,'data',private.student_session_json(p_owner,v_existing.id),'already_cancelled',true); end if;
    if v_existing.version<>p_expected_version then raise exception 'CONFLICT'; end if;
    update public.study_sessions set cancelled_at=statement_timestamp(),version=version+1,updated_at=statement_timestamp()
      where id=p_session_id and owner_id=p_owner;
    return jsonb_build_object('ok',true,'data',private.student_session_json(p_owner,p_session_id),'already_cancelled',false);
  exception when others then
    return private.student_mcp_error(private.student_mcp_exception_code(SQLSTATE,SQLERRM));
  end;
end $$;

-- Private helper functions are not direct RPC entry points. The validator is
-- the sole exception because existing CHECK constraints invoke it as the app.
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.valid_priority_rules(jsonb) to authenticated;

-- The consent screen is the only browser surface that can create/re-enable an
-- agent grant. Grant revocation is immediate in SQL; the UI also calls the
-- Supabase OAuth revokeGrant API to invalidate refresh tokens.
create or replace function public.student_mcp_access_token_hook(event jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare v_claims jsonb:=event->'claims'; v_client text; v_resource text;
begin
  v_client:=coalesce(event->>'client_id',v_claims->>'client_id');
  if v_client is not null and v_client<>'' then
    select canonical_resource into v_resource from public.student_agent_runtime_config where singleton;
    if v_resource is null then raise exception 'MCP resource is not configured'; end if;
    v_claims:=jsonb_set(v_claims,'{aud}',to_jsonb(v_resource),true);
  end if;
  return jsonb_build_object('claims',v_claims);
end $$;

-- Existing app RPCs remain available to regular browser sessions only.
create or replace function public.create_saved_assignment(p_name text,p_class_name text,p_due_date date,p_estimated_minutes integer,p_optional boolean,p_percentage_of_grade numeric,p_request_id uuid,p_completed boolean default false,p_confirm_long boolean default false,p_description text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); return private.create_saved_assignment_core(p_name,p_class_name,p_due_date,p_estimated_minutes,p_optional,p_percentage_of_grade,p_request_id,p_completed,p_confirm_long,p_description); end $$;
create or replace function public.create_ai_chat(p_title text) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); return private.create_ai_chat_browser_core(p_title); end $$;
create or replace function public.begin_ai_turn(p_chat_id bigint,p_request_id uuid,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); return private.begin_ai_turn_browser_core(p_chat_id,p_request_id,p_text); end $$;
create or replace function public.confirm_ai_assignment(p_chat_id bigint,p_request_id uuid,p_confirm_long boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); return private.confirm_ai_assignment_browser_core(p_chat_id,p_request_id,p_confirm_long); end $$;
create or replace function public.change_ai_assignment_draft(p_chat_id bigint,p_request_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); perform private.change_ai_assignment_draft_browser_core(p_chat_id,p_request_id,p_action); end $$;
create or replace function public.name_ai_chat(p_chat_id bigint,p_message text) returns text language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); return private.name_ai_chat_browser_core(p_chat_id,p_message); end $$;
create or replace function public.record_app_open() returns date language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); return private.record_app_open_browser_core(); end $$;
create or replace function public.get_weekly_engagement_okr() returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); return private.get_weekly_engagement_okr_browser_core(); end $$;
create or replace function public.reserve_ai_time_suggestion() returns void language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); perform private.reserve_ai_time_suggestion_browser_core(); end $$;
create or replace function public.remove_saved_assignment(p_assignment_id bigint) returns bigint language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); return private.remove_saved_assignment_browser_core(p_assignment_id); end $$;

create or replace function public.student_agent_approve_browser(p_client_id text,p_client_name text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_row public.student_agent_grants;
begin
  perform private.assert_browser_session();
  if p_client_id is null or p_client_id<>btrim(p_client_id) or char_length(p_client_id) not between 1 and 200 then raise exception 'Use a valid connected-client ID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||p_client_id,0));
  insert into public.student_agent_grants(owner_id,client_id,client_name,permission_bundle,approved_at,revoked_at)
  values(auth.uid(),p_client_id,coalesce(nullif(left(btrim(p_client_name),200),''),'Connected agent'),
    '{"read_tasks":true,"create_tasks":true,"update_completion":true,"manage_study_sessions":true}'::jsonb,statement_timestamp(),null)
  on conflict(owner_id,client_id) do update set client_name=excluded.client_name,permission_bundle=excluded.permission_bundle,approved_at=excluded.approved_at,revoked_at=null
  returning * into v_row;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('id',v_row.id,'client_id',v_row.client_id,'client_name',v_row.client_name,'approved_at',v_row.approved_at));
end $$;

create or replace function public.student_agent_list_browser() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_data jsonb;
begin
  perform private.assert_browser_session();
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'client_id',client_id,'client_name',client_name,'approved_at',approved_at) order by approved_at desc),'[]'::jsonb)
    into v_data from public.student_agent_grants where owner_id=auth.uid() and revoked_at is null;
  return jsonb_build_object('ok',true,'data',v_data);
end $$;

create or replace function public.student_agent_revoke_browser(p_grant_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_client text; v_revoked timestamptz;
begin
  perform private.assert_browser_session();
  update public.student_agent_grants set revoked_at=coalesce(revoked_at,statement_timestamp())
    where id=p_grant_id and owner_id=auth.uid() returning client_id,revoked_at into v_client,v_revoked;
  if v_client is null then raise exception 'The connected agent was not found'; end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('client_id',v_client,'revoked_at',v_revoked));
end $$;

-- Consent cleanup may lose the row ID when the approval RPC response is lost.
-- Revoke only this caller's client row and make repeats safe.
create or replace function public.student_agent_revoke_client_browser(p_client_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_rows integer;
begin
  perform private.assert_browser_session();
  if p_client_id is null or p_client_id<>btrim(p_client_id) or char_length(p_client_id) not between 1 and 200 then raise exception 'Use a valid connected-client ID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||p_client_id,0));
  update public.student_agent_grants set revoked_at=statement_timestamp()
    where owner_id=auth.uid() and client_id=p_client_id and revoked_at is null;
  get diagnostics v_rows=row_count;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('client_id',p_client_id,'active',false,'changed',v_rows>0));
end $$;

create or replace function public.student_sessions_create_browser(p_assignment_id bigint,p_starts_at timestamptz,p_ends_at timestamptz,p_timezone text,p_client_request_id uuid,p_allow_after_due boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); return private.save_student_study_session(auth.uid(),p_assignment_id,p_starts_at,p_ends_at,p_timezone,p_client_request_id,p_allow_after_due,null,null); end $$;
create or replace function public.student_sessions_update_browser(p_session_id uuid,p_expected_version integer,p_assignment_id bigint,p_starts_at timestamptz,p_ends_at timestamptz,p_timezone text,p_allow_after_due boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); return private.save_student_study_session(auth.uid(),p_assignment_id,p_starts_at,p_ends_at,p_timezone,null,p_allow_after_due,p_session_id,p_expected_version); end $$;
create or replace function public.student_sessions_cancel_browser(p_session_id uuid,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
begin perform private.assert_browser_session(); return private.cancel_student_study_session(auth.uid(),p_session_id,p_expected_version); end $$;

create or replace function public.student_mcp_get_workspace_context() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_error text;
begin
  v_error:=private.student_mcp_preflight('read_tasks',false); if v_error is not null then return private.student_mcp_error(v_error); end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('timezone','America/Denver','source','Saved Canvas To-Do Prioritizer app data','live_canvas',false,
    'capabilities',jsonb_build_array('read assignments, lists, and priority rules','create assignments','update local completion','manage saved study sessions')));
end $$;

create or replace function public.student_mcp_list_assignments(p_completion_filter text default 'incomplete',p_due_from timestamptz default null,p_due_to timestamptz default null,p_list_id uuid default null,p_cursor bigint default null,p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_error text; v_owner uuid:=auth.uid(); v_data jsonb;
begin
  v_error:=private.student_mcp_preflight('read_tasks',false); if v_error is not null then return private.student_mcp_error(v_error); end if;
  begin
    if p_completion_filter is null or p_completion_filter not in ('incomplete','complete','all') or p_limit is null or p_limit not between 1 and 100 or (p_cursor is not null and p_cursor<0) or (p_due_from is not null and p_due_to is not null and p_due_from>p_due_to) then raise exception 'VALIDATION_ERROR'; end if;
    if p_list_id is not null and not exists(select 1 from public.lists where id=p_list_id and owner_id=v_owner) then raise exception 'NOT_FOUND'; end if;
    with candidates as materialized (
      select a.* from public.assignments a where a.owner_id=v_owner and a.deleted=false
        and (p_completion_filter='all' or (p_completion_filter='complete' and a.completed=true) or (p_completion_filter='incomplete' and a.completed=false))
        and (p_due_from is null or a.due_date>=p_due_from) and (p_due_to is null or a.due_date<=p_due_to)
        and (p_cursor is null or a.assignment_id>p_cursor)
        and (p_list_id is null or exists(select 1 from public.list_assignments la where la.assignment_id=a.assignment_id and la.list_id=p_list_id))
      order by a.assignment_id limit p_limit+1
    ), page as (select * from candidates order by assignment_id limit p_limit)
    select jsonb_build_object('assignments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',assignment_id::text,'title',name,'description',description,'class_name',class_name,'due_at',due_date,
      'estimated_minutes',case when est_time is null then null else round(extract(epoch from est_time)/60)::integer end,
      'grade_weight_percent',percentage_of_grade,'priority',priority,'optional',optional,'completed',completed) order by assignment_id) from page),'[]'::jsonb),
      'next_cursor',case when (select count(*) from candidates)>p_limit then (select assignment_id::text from page order by assignment_id desc limit 1) else null end)
      into v_data;
    return jsonb_build_object('ok',true,'data',v_data);
  exception when others then return private.student_mcp_error(private.student_mcp_exception_code(SQLSTATE,SQLERRM)); end;
end $$;

create or replace function public.student_mcp_get_assignment(p_assignment_id bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_error text; v_owner uuid:=auth.uid(); v_data jsonb;
begin
  v_error:=private.student_mcp_preflight('read_tasks',false); if v_error is not null then return private.student_mcp_error(v_error); end if;
  begin
    select jsonb_build_object('id',a.assignment_id::text,'title',a.name,'description',a.description,'class_name',a.class_name,'due_at',a.due_date,
      'estimated_minutes',case when a.est_time is null then null else round(extract(epoch from a.est_time)/60)::integer end,
      'grade_weight_percent',a.percentage_of_grade,'priority',a.priority,'optional',a.optional,'completed',a.completed)
      into v_data from public.assignments a where a.assignment_id=p_assignment_id and a.owner_id=v_owner and a.deleted=false;
    if v_data is null then raise exception 'NOT_FOUND'; end if;
    return jsonb_build_object('ok',true,'data',v_data);
  exception when others then return private.student_mcp_error(private.student_mcp_exception_code(SQLSTATE,SQLERRM)); end;
end $$;

create or replace function public.student_mcp_list_lists(p_cursor uuid default null,p_limit integer default 25) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_error text; v_owner uuid:=auth.uid(); v_data jsonb;
begin
  v_error:=private.student_mcp_preflight('read_tasks',false); if v_error is not null then return private.student_mcp_error(v_error); end if;
  begin
    if p_limit is null or p_limit not between 1 and 100 then raise exception 'VALIDATION_ERROR'; end if;
    with candidates as materialized (select l.* from public.lists l where l.owner_id=v_owner and (p_cursor is null or l.id>p_cursor) order by l.id limit p_limit+1),
      page as (select * from candidates order by id limit p_limit)
    select jsonb_build_object('lists',coalesce((select jsonb_agg(jsonb_build_object('id',p.id::text,'name',p.name,'assignment_ids',
        coalesce((select jsonb_agg(la.assignment_id::text order by la.assignment_id) from public.list_assignments la join public.assignments a on a.assignment_id=la.assignment_id
          where la.list_id=p.id and a.owner_id=v_owner and a.deleted=false),'[]'::jsonb)) order by p.id) from page p),'[]'::jsonb),
      'next_cursor',case when (select count(*) from candidates)>p_limit then (select id::text from page order by id desc limit 1) else null end) into v_data;
    return jsonb_build_object('ok',true,'data',v_data);
  exception when others then return private.student_mcp_error(private.student_mcp_exception_code(SQLSTATE,SQLERRM)); end;
end $$;

create or replace function public.student_mcp_get_priority_rules(p_scope text,p_list_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_error text; v_owner uuid:=auth.uid(); v_rules jsonb:='[]'::jsonb; v_ignore boolean:=false;
begin
  v_error:=private.student_mcp_preflight('read_tasks',false); if v_error is not null then return private.student_mcp_error(v_error); end if;
  begin
    if p_scope is null or p_scope not in ('settings','main','classes','list') or (p_scope='list' and p_list_id is null) or (p_scope<>'list' and p_list_id is not null) then raise exception 'VALIDATION_ERROR'; end if;
    if p_scope='list' then
      select priority_rules,ignore_user_rules into v_rules,v_ignore from public.lists where id=p_list_id and owner_id=v_owner;
      if not found then raise exception 'NOT_FOUND'; end if;
    else
      select rules,ignore_user_rules into v_rules,v_ignore from public.user_priorities where owner_id=v_owner and scope=p_scope;
      if not found then v_rules:='[]'::jsonb; v_ignore:=false; end if;
    end if;
    return jsonb_build_object('ok',true,'data',jsonb_build_object('scope',p_scope,'list_id',case when p_list_id is null then null else p_list_id::text end,'rules',v_rules,'ignore_user_rules',v_ignore));
  exception when others then return private.student_mcp_error(private.student_mcp_exception_code(SQLSTATE,SQLERRM)); end;
end $$;

create or replace function public.student_mcp_create_assignment(p_title text,p_class_name text,p_due_date date,p_estimated_minutes integer,p_optional boolean,p_grade_weight_percent numeric,p_description text,p_request_id uuid,p_confirm_long boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_error text; v_saved jsonb; v_data jsonb;
begin
  v_error:=private.student_mcp_preflight('create_tasks',true); if v_error is not null then return private.student_mcp_error(v_error); end if;
  begin
    v_saved:=private.create_saved_assignment_core(p_title,p_class_name,p_due_date,p_estimated_minutes,p_optional,p_grade_weight_percent,p_request_id,false,p_confirm_long,p_description);
    v_data:=jsonb_build_object('id',v_saved->>'assignment_id','title',v_saved->>'name','description',v_saved->'description','class_name',v_saved->>'class_name',
      'due_at',v_saved->'due_date','estimated_minutes',case when v_saved->>'est_time' is null then null else round(extract(epoch from (v_saved->>'est_time')::interval)/60)::integer end,
      'grade_weight_percent',v_saved->'percentage_of_grade','priority',v_saved->'priority','optional',v_saved->'optional','completed',coalesce((v_saved->>'completed')::boolean,false));
    return jsonb_build_object('ok',true,'data',v_data);
  exception when others then return private.student_mcp_error(private.student_mcp_exception_code(SQLSTATE,SQLERRM)); end;
end $$;

create or replace function public.student_mcp_set_assignment_completion(p_assignment_id bigint,p_expected_completed boolean,p_completed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_error text; v_owner uuid:=auth.uid(); v_current boolean; v_title text;
begin
  v_error:=private.student_mcp_preflight('update_completion',true); if v_error is not null then return private.student_mcp_error(v_error); end if;
  begin
    if p_expected_completed is null or p_completed is null then raise exception 'VALIDATION_ERROR'; end if;
    select completed,name into v_current,v_title from public.assignments where assignment_id=p_assignment_id and owner_id=v_owner and deleted=false for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_current=p_completed then return jsonb_build_object('ok',true,'data',jsonb_build_object('id',p_assignment_id::text,'title',v_title,'completed',v_current,'changed',false)); end if;
    if v_current<>p_expected_completed then raise exception 'CONFLICT'; end if;
    update public.assignments set completed=p_completed where assignment_id=p_assignment_id and owner_id=v_owner and deleted=false;
    return jsonb_build_object('ok',true,'data',jsonb_build_object('id',p_assignment_id::text,'title',v_title,'completed',p_completed,'changed',true));
  exception when others then return private.student_mcp_error(private.student_mcp_exception_code(SQLSTATE,SQLERRM)); end;
end $$;

create or replace function public.student_mcp_list_study_sessions(p_start timestamptz,p_end timestamptz,p_cursor_start timestamptz default null,p_cursor_id uuid default null,p_limit integer default 25,p_include_cancelled boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_error text; v_owner uuid:=auth.uid(); v_data jsonb;
begin
  v_error:=private.student_mcp_preflight('manage_study_sessions',false); if v_error is not null then return private.student_mcp_error(v_error); end if;
  begin
    if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '93 days' or p_limit is null or p_limit not between 1 and 100 or ((p_cursor_start is null)<>(p_cursor_id is null)) then raise exception 'VALIDATION_ERROR'; end if;
    with candidates as materialized (
      select s.* from public.study_sessions s where s.owner_id=v_owner and s.starts_at<p_end and s.ends_at>p_start
        and (p_include_cancelled or s.cancelled_at is null)
        and (p_cursor_start is null or (s.starts_at,s.id)>(p_cursor_start,p_cursor_id))
      order by s.starts_at,s.id limit p_limit+1
    ), page as (select * from candidates order by starts_at,id limit p_limit)
    select jsonb_build_object('study_sessions',coalesce((select jsonb_agg(private.student_session_json(v_owner,id) order by starts_at,id) from page),'[]'::jsonb),
      'next_cursor',case when (select count(*) from candidates)>p_limit then (select starts_at::text||'|'||id::text from page order by starts_at desc,id desc limit 1) else null end) into v_data;
    return jsonb_build_object('ok',true,'data',v_data);
  exception when others then return private.student_mcp_error(private.student_mcp_exception_code(SQLSTATE,SQLERRM)); end;
end $$;

create or replace function public.student_mcp_create_study_session(p_assignment_id bigint,p_starts_at timestamptz,p_ends_at timestamptz,p_timezone text,p_client_request_id uuid,p_allow_after_due boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_error text;
begin
  v_error:=private.student_mcp_preflight('manage_study_sessions',true); if v_error is not null then return private.student_mcp_error(v_error); end if;
  return private.save_student_study_session(auth.uid(),p_assignment_id,p_starts_at,p_ends_at,p_timezone,p_client_request_id,p_allow_after_due,null,null);
end $$;

create or replace function public.student_mcp_reschedule_study_session(p_session_id uuid,p_expected_version integer,p_assignment_id bigint,p_starts_at timestamptz,p_ends_at timestamptz,p_timezone text,p_allow_after_due boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_error text;
begin
  v_error:=private.student_mcp_preflight('manage_study_sessions',true); if v_error is not null then return private.student_mcp_error(v_error); end if;
  return private.save_student_study_session(auth.uid(),p_assignment_id,p_starts_at,p_ends_at,p_timezone,null,p_allow_after_due,p_session_id,p_expected_version);
end $$;

create or replace function public.student_mcp_cancel_study_session(p_session_id uuid,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_error text;
begin
  v_error:=private.student_mcp_preflight('manage_study_sessions',true); if v_error is not null then return private.student_mcp_error(v_error); end if;
  return private.cancel_student_study_session(auth.uid(),p_session_id,p_expected_version);
end $$;

-- Audit all public PostgREST functions, including grants inherited from PUBLIC.
-- Revoke first, then expose only these browser-safe wrappers and MCP entry points.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and (pg_catalog.has_function_privilege('authenticated',p.oid,'execute') or pg_catalog.has_function_privilege('anon',p.oid,'execute'))
  loop execute format('revoke execute on function %s from public,anon,authenticated',f.signature); end loop;
end $$;

grant execute on function public.student_mcp_access_token_hook(jsonb) to supabase_auth_admin;
grant execute on function public.create_saved_assignment(text,text,date,integer,boolean,numeric,uuid,boolean,boolean,text),
  public.create_ai_chat(text),public.begin_ai_turn(bigint,uuid,text),public.confirm_ai_assignment(bigint,uuid,boolean),
  public.change_ai_assignment_draft(bigint,uuid,text),public.name_ai_chat(bigint,text),public.record_app_open(),
  public.get_weekly_engagement_okr(),public.reserve_ai_time_suggestion(),public.remove_saved_assignment(bigint),
  public.student_agent_approve_browser(text,text),public.student_agent_list_browser(),public.student_agent_revoke_browser(uuid),public.student_agent_revoke_client_browser(text),
  public.student_sessions_create_browser(bigint,timestamptz,timestamptz,text,uuid,boolean),
  public.student_sessions_update_browser(uuid,integer,bigint,timestamptz,timestamptz,text,boolean),
  public.student_sessions_cancel_browser(uuid,integer),public.student_mcp_get_workspace_context(),
  public.student_mcp_list_assignments(text,timestamptz,timestamptz,uuid,bigint,integer),public.student_mcp_get_assignment(bigint),
  public.student_mcp_list_lists(uuid,integer),public.student_mcp_get_priority_rules(text,uuid),
  public.student_mcp_create_assignment(text,text,date,integer,boolean,numeric,text,uuid,boolean),
  public.student_mcp_set_assignment_completion(bigint,boolean,boolean),
  public.student_mcp_list_study_sessions(timestamptz,timestamptz,timestamptz,uuid,integer,boolean),
  public.student_mcp_create_study_session(bigint,timestamptz,timestamptz,text,uuid,boolean),
  public.student_mcp_reschedule_study_session(uuid,integer,bigint,timestamptz,timestamptz,text,boolean),
  public.student_mcp_cancel_study_session(uuid,integer)
to authenticated;

-- Stop if a granted RPC escaped the explicit allowlist.
do $$
declare v_unexpected text;
begin
  select string_agg(p.oid::regprocedure::text,', ' order by p.oid::regprocedure::text) into v_unexpected
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and pg_catalog.has_function_privilege('authenticated',p.oid,'execute')
    and p.proname not in ('create_saved_assignment','create_ai_chat','begin_ai_turn','confirm_ai_assignment','change_ai_assignment_draft','name_ai_chat',
      'record_app_open','get_weekly_engagement_okr','reserve_ai_time_suggestion','remove_saved_assignment','student_agent_approve_browser',
      'student_agent_list_browser','student_agent_revoke_browser','student_agent_revoke_client_browser','student_sessions_create_browser','student_sessions_update_browser',
      'student_sessions_cancel_browser','student_mcp_get_workspace_context','student_mcp_list_assignments','student_mcp_get_assignment',
      'student_mcp_list_lists','student_mcp_get_priority_rules','student_mcp_create_assignment','student_mcp_set_assignment_completion',
      'student_mcp_list_study_sessions','student_mcp_create_study_session','student_mcp_reschedule_study_session','student_mcp_cancel_study_session');
  if v_unexpected is not null then raise exception 'Review required: unexpected authenticated RPCs remain: %',v_unexpected; end if;
end $$;

notify pgrst,'reload schema';
commit;
