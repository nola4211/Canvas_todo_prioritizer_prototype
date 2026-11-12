-- Track how long an assignment has stayed completed for the 30-day archive.
-- This adds one column to assignments; it does not create another table.
begin;

alter table public.assignments
  add column completed_at timestamptz;

-- Existing completed assignments start their 30-day clock when this migration
-- is installed because their original completion time was never recorded.
update public.assignments
set completed_at=statement_timestamp()
where completed=true;

alter table public.assignments
  add constraint assignments_completed_at_matches_status
  check ((completed and completed_at is not null) or (not completed and completed_at is null));

create or replace function private.set_assignment_completed_at() returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.completed then
    if tg_op='INSERT' or not old.completed or new.completed_at is null then
      new.completed_at=statement_timestamp();
    end if;
  else
    new.completed_at=null;
  end if;
  return new;
end
$$;

revoke all on function private.set_assignment_completed_at() from public,anon,authenticated;

create trigger assignments_completed_at
before insert or update of completed on public.assignments
for each row execute function private.set_assignment_completed_at();

grant select (completed_at) on public.assignments to authenticated;

notify pgrst,'reload schema';
commit;
