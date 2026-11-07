-- Default: three active agent authorizations per app account.
-- Extra slots require an audited override by a project database administrator.
begin;
create table public.student_agent_connection_limits (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 connection_limit integer not null check(connection_limit between 3 and 100),
 approval_reason text not null check(char_length(btrim(approval_reason)) between 1 and 1000),
 approved_by text not null default current_user,
 approved_at timestamptz not null default statement_timestamp()
);
alter table public.student_agent_connection_limits enable row level security;
revoke all on public.student_agent_connection_limits from public,anon,authenticated,service_role;

create or replace function public.student_agent_approve_browser(p_client_id text,p_client_name text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_row public.student_agent_grants; v_limit integer; v_active boolean;
begin
 perform private.assert_browser_session();
 if p_client_id is null or p_client_id<>btrim(p_client_id) or char_length(p_client_id) not between 1 and 200 then raise exception 'Use a valid connected-client ID'; end if;
 -- One lock per owner, not per client: simultaneous different agents must
 -- not all observe the same free slot and exceed the limit.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':agent-connections',0));
 select coalesce((select connection_limit from public.student_agent_connection_limits where owner_id=auth.uid()),3) into v_limit;
 select exists(select 1 from public.student_agent_grants where owner_id=auth.uid() and client_id=p_client_id and revoked_at is null) into v_active;
 if not v_active and (select count(*) from public.student_agent_grants where owner_id=auth.uid() and revoked_at is null)>=v_limit then
  raise exception 'AGENT_LIMIT_REACHED: You can connect up to % agents. Disconnect an agent in Settings or request permission for more.',v_limit;
 end if;
 insert into public.student_agent_grants(owner_id,client_id,client_name,permission_bundle,approved_at,revoked_at)
 values(auth.uid(),p_client_id,coalesce(nullif(left(btrim(p_client_name),200),''),'Connected agent'),
  '{"read_tasks":true,"create_tasks":true,"update_completion":true,"manage_study_sessions":true}'::jsonb,statement_timestamp(),null)
 on conflict(owner_id,client_id) do update set client_name=excluded.client_name,permission_bundle=excluded.permission_bundle,approved_at=excluded.approved_at,revoked_at=null
 returning * into v_row;
 return jsonb_build_object('ok',true,'data',jsonb_build_object('id',v_row.id,'client_id',v_row.client_id,'client_name',v_row.client_name,'approved_at',v_row.approved_at));
end $$;
notify pgrst,'reload schema';
commit;
