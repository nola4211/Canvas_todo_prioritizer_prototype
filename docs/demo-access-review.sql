-- REVIEW DRAFT ONLY: never run without the team's approval.
-- No tables, sample rows, credentials, or auth users are created.
-- This closes public access to the six existing tables and lets ONE existing
-- Supabase Auth demo account read approved synthetic assignments and update
-- ONLY their completed column. Other product features will need later policies.
-- Replace demo_uid and demo_ids after Lex/Nolan finish the sample data.
begin;
do $review$
declare
  demo_uid uuid := '00000000-0000-0000-0000-000000000000';
  demo_ids bigint[] := array[]::bigint[];
  task_table_name text;
  column_names text;
  tables text[] := array['assignments','Class','Class_User','user','user_assignment','chat_history'];
begin
  if demo_uid = '00000000-0000-0000-0000-000000000000' or cardinality(demo_ids) = 0 then
    raise exception 'Set the real Supabase Auth demo UUID and synthetic assignment IDs first.';
  end if;
  if not exists(select 1 from auth.users where id = demo_uid) then
    raise exception 'The shared demo account does not exist in Supabase Auth.';
  end if;
  if exists(select 1 from pg_policies where schemaname = 'public' and tablename = any(tables)) then
    raise exception 'Existing policies found. Stop and coordinate with the team rather than replacing them.';
  end if;
  if (select count(*) from public.assignments where assignment_id = any(demo_ids) and deleted = false) <> cardinality(demo_ids) then
    raise exception 'Every demo assignment must exist, be unique, and not be deleted.';
  end if;
  foreach task_table_name in array tables loop
    execute format('alter table public.%I enable row level security',task_table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated',task_table_name);
    -- Remove any prior column grants as well as table-wide grants.
    select string_agg(format('%I',column_name),', ') into column_names
      from information_schema.columns where table_schema='public' and information_schema.columns.table_name=task_table_name;
    execute format('revoke select (%s), insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',column_names,column_names,column_names,column_names,task_table_name);
  end loop;
  grant select (assignment_id,name,percentage_of_grade,completed,priority,due_date,est_time,deleted) on public.assignments to authenticated;
  grant update (completed) on public.assignments to authenticated;
  execute format('create policy module05_demo_read on public.assignments for select to authenticated using ((select auth.uid()) = %L::uuid and assignment_id = any(%L::bigint[]) and deleted = false)',demo_uid,demo_ids);
  execute format('create policy module05_demo_complete on public.assignments for update to authenticated using ((select auth.uid()) = %L::uuid and assignment_id = any(%L::bigint[]) and deleted = false) with check ((select auth.uid()) = %L::uuid and assignment_id = any(%L::bigint[]) and deleted = false)',demo_uid,demo_ids,demo_uid,demo_ids);
end $review$;
commit;
