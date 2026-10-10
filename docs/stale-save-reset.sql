-- UNAPPLIED: fallback cleanup after the controlled stale-value test.
-- Prefer reloading and unchecking through the frontend to verify the real action.
begin;
do $check$
declare affected integer;
begin
  update public.assignments set completed=false
    where assignment_id=1 and deleted=false
      and name='Demo: IS401 Exam'
      and description='MODULE05 synthetic demo assignment; no real student data.';
  get diagnostics affected=row_count;
  if affected<>1 then
    raise exception 'Expected synthetic assignment changed; no change applied.';
  end if;
end $check$;
commit;
select assignment_id,name,completed from public.assignments where assignment_id in (1,2,3) order by assignment_id;
