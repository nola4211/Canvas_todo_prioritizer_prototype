-- Applied to uowlwdwrqceklbqjcnmc on October 27, 2026. Do not rerun there.
-- For a fresh project, run once after checking the current schema.
-- This migration adds lists; it does not change existing assignment policies.
begin;

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);
create unique index lists_owner_name on public.lists (owner_id, lower(name));

create table public.list_assignments (
  list_id uuid not null references public.lists(id) on delete cascade,
  assignment_id bigint not null references public.assignments(assignment_id) on delete cascade,
  primary key (list_id, assignment_id)
);
create index list_assignments_assignment on public.list_assignments (assignment_id);

alter table public.lists enable row level security;
alter table public.list_assignments enable row level security;
revoke all on public.lists, public.list_assignments from public, anon, authenticated;
grant select, delete on public.lists to authenticated;
grant insert (name), update (name) on public.lists to authenticated;
grant select, insert, delete on public.list_assignments to authenticated;

create policy own_lists on public.lists for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy read_own_memberships on public.list_assignments for select to authenticated
  using (exists (select 1 from public.lists where id = list_id and owner_id = (select auth.uid())));
create policy add_own_memberships on public.list_assignments for insert to authenticated
  with check (
    exists (select 1 from public.lists where id = list_id and owner_id = (select auth.uid()))
    -- The assignments table's existing security policies also apply to this query.
    and exists (select 1 from public.assignments where assignment_id = list_assignments.assignment_id and deleted = false)
  );
create policy remove_own_memberships on public.list_assignments for delete to authenticated
  using (exists (select 1 from public.lists where id = list_id and owner_id = (select auth.uid())));

-- Create Study once, when an account is created. No page-load check recreates it.
-- This function runs as its database owner because new users cannot insert yet.
create function public.create_starter_list() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lists (owner_id, name) values (new.id, 'Study');
  return new;
end;
$$;
revoke all on function public.create_starter_list() from public, anon, authenticated;
create trigger create_starter_list after insert on auth.users
  for each row execute function public.create_starter_list();

-- Accounts that already exist receive the same starting list during setup.
insert into public.lists (owner_id, name) select id, 'Study' from auth.users;
commit;
