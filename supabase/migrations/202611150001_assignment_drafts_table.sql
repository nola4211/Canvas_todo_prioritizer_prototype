-- Apply after creating public.assignments_draft as a copy of public.assignments.
-- Drafts may be incomplete. Only assignment_id (generated) and name are required.
begin;

alter table public.assignments_draft alter column owner_id set default auth.uid();
alter table public.assignments_draft alter column name set not null;
do $$
declare v_column_name text;
begin
  for v_column_name in select c.column_name from information_schema.columns c
    where c.table_schema='public' and c.table_name='assignments_draft' and c.is_nullable='NO'
      and c.column_name not in ('assignment_id','name','owner_id') loop
    execute format('alter table public.assignments_draft alter column %I drop not null',v_column_name);
  end loop;
end $$;

alter table public.assignments_draft drop constraint if exists assignment_created_fields;

alter table public.assignments_draft enable row level security;
revoke all on public.assignments_draft from public, anon, authenticated;
grant select (assignment_id, name, description, class_name, due_date, est_time, optional,
  percentage_of_grade, owner_id) on public.assignments_draft to authenticated;
grant insert (owner_id, name, description, class_name, due_date, est_time, optional,
  percentage_of_grade, priority, completed, deleted, client_request_id)
  on public.assignments_draft to authenticated;
grant update (owner_id, name, description, class_name, due_date, est_time, optional,
  percentage_of_grade, priority, completed, deleted, client_request_id)
  on public.assignments_draft to authenticated;
grant delete on public.assignments_draft to authenticated;

do $$
declare policy_name text;
begin
  for policy_name in select policyname from pg_policies
    where schemaname='public' and tablename='assignments_draft' loop
    execute format('drop policy %I on public.assignments_draft',policy_name);
  end loop;
end $$;
create policy assignment_draft_owner_access on public.assignments_draft for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

do $$
declare sequence_name text := pg_get_serial_sequence('public.assignments_draft', 'assignment_id');
max_id bigint;
begin
  if sequence_name is not null then
    execute format('grant usage on sequence %s to authenticated', sequence_name);
    execute 'select max(assignment_id) from public.assignments_draft' into max_id;
    if max_id is null then
      perform setval(sequence_name::regclass, 1, false);
    else
      perform setval(sequence_name::regclass, max_id, true);
    end if;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';
