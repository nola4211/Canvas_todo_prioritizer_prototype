-- UNAPPLIED: controlled failure test for the approved synthetic demo only.
-- First load assignment 1 as incomplete in the signed-in frontend.
-- After this commits, click that checkbox WITHOUT reloading the frontend.
-- Its expected old value is stale; the frontend must show an unconfirmed save.
begin;
do $check$
declare affected integer;
begin
  update public.assignments set completed=true
    where assignment_id=1 and completed=false and deleted=false
      and name='Demo: IS401 Exam'
      and description='MODULE05 synthetic demo assignment; no real student data.';
  get diagnostics affected=row_count;
  if affected<>1 then
    raise exception 'Synthetic assignment changed or is not incomplete; no change applied.';
  end if;
end $check$;
commit;
select assignment_id,name,completed from public.assignments where assignment_id in (1,2,3) order by assignment_id;
