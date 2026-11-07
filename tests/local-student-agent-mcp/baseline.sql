-- Synthetic reconstruction of the pre-MCP tables for disposable local tests only.
-- Never use this fixture on a hosted or production database.
do $$ begin
 if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
 if not exists(select from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;
create schema auth;
create schema extensions;
create schema storage;
set search_path=public,extensions;
create table auth.users(id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema auth,public,extensions,storage to anon,authenticated,service_role,supabase_auth_admin;
grant execute on function auth.jwt(),auth.uid() to anon,authenticated,service_role,supabase_auth_admin;
create table public.assignments(
 assignment_id bigint generated always as identity primary key,
 name text, percentage_of_grade numeric, completed boolean not null default false,
 deleted boolean not null default false, priority smallint not null default 2,
 due_date timestamptz, description text, est_time interval,
 user_assignment_id bigint
);
alter table public.assignments enable row level security;
grant select(assignment_id,name,percentage_of_grade,completed,priority,due_date,est_time,deleted),update(completed) on public.assignments to authenticated;
create policy synthetic_demo_read on public.assignments for select to authenticated using(auth.uid()='00000000-0000-4000-8000-0000000000d0' and deleted=false);
create policy synthetic_demo_complete on public.assignments for update to authenticated using(auth.uid()='00000000-0000-4000-8000-0000000000d0' and deleted=false);
create view public.synthetic_assignment_view as select assignment_id,name from public.assignments;
grant select on public.synthetic_assignment_view to authenticated;
create table public.chat("chat_ID" bigint generated always as identity primary key,created_at timestamptz default now());
create table public.message("message_ID" bigint generated always as identity primary key,"chat_ID" bigint references public.chat("chat_ID") on delete cascade,message text,sent_at timestamptz default now());
create table storage.objects(id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id),name text);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
create policy owner_object_access on storage.objects for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
