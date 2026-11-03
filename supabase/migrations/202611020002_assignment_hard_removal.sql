-- Removal now deletes the row, along with dependent rows covered by foreign-key cascades.
begin;

create or replace function public.remove_saved_assignment(p_assignment_id bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  removed_id bigint;
begin
  if caller is null then raise exception 'Sign in before removing an assignment.'; end if;

  delete from public.assignments a
  where a.assignment_id = p_assignment_id and a.deleted = false
    and (a.owner_id = caller or (
      a.owner_id is null
      and a.description = 'MODULE05 synthetic demo assignment; no real student data.'
      and a.assignment_id in (1, 2, 3)
      and exists (select 1 from auth.users u where u.id = caller and u.email = 'test@user.com')
    ))
  returning a.assignment_id into removed_id;

  if removed_id is null then raise exception 'Assignment is unavailable or already removed.'; end if;
  return removed_id;
end;
$$;

commit;
