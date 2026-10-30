-- Apply once after reviewing the live assignments schema and existing policies.
-- Existing synthetic rows remain ownerless and keep their current demo policies.
begin;

alter table public.assignments
  add column owner_id uuid default auth.uid() references auth.users(id) on delete cascade,
  add column optional boolean not null default false,
  add column client_request_id uuid unique,
  add constraint assignment_created_fields check (
    owner_id is null or
    (name is not null and char_length(btrim(name)) between 1 and 200
      and priority is not null and priority between 0 and 3
      and due_date is not null and client_request_id is not null)
  );

create index assignments_owner_visible on public.assignments(owner_id, assignment_id) where deleted = false;

grant select (owner_id, optional, client_request_id) on public.assignments to authenticated;
grant insert (name, due_date, est_time, priority, optional, percentage_of_grade, completed, deleted, client_request_id)
  on public.assignments to authenticated;

-- Serial columns need sequence access; identity columns do not.
do $$
declare sequence_name text := pg_get_serial_sequence('public.assignments', 'assignment_id');
begin
  if sequence_name is not null then
    execute format('grant usage on sequence %s to authenticated', sequence_name);
  end if;
end $$;

create policy assignment_owner_read on public.assignments for select to authenticated
  using (owner_id = (select auth.uid()) and deleted = false);
create policy assignment_owner_insert on public.assignments for insert to authenticated
  with check (owner_id = (select auth.uid()) and deleted = false);
create policy assignment_owner_complete on public.assignments for update to authenticated
  using (owner_id = (select auth.uid()) and deleted = false)
  with check (owner_id = (select auth.uid()) and deleted = false);

commit;
