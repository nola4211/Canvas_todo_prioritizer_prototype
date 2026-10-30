-- Run after 202610300002_assignment_creation.sql. All writes roll back.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','a527cc80-a8d6-43d6-9a04-b62650a0d621',true);
select set_config('request.jwt.claims','{"sub":"a527cc80-a8d6-43d6-9a04-b62650a0d621","role":"authenticated"}',true);
with created as (
  insert into public.assignments
    (name,due_date,est_time,priority,optional,percentage_of_grade,completed,deleted,client_request_id)
  values
    ('__assignment_creation_verification__','2026-11-01T23:59:00-07:00','45 minutes',2,true,null,false,false,
     '00000000-0000-4000-8000-000000000002')
  returning assignment_id
)
select set_config('canvas.created_assignment',assignment_id::text,true) from created;
do $check$
declare chosen bigint := current_setting('canvas.created_assignment')::bigint;
begin
  if chosen is null or not exists (
    select 1 from public.assignments where assignment_id=chosen
      and name='__assignment_creation_verification__' and optional=true and completed=false
  ) then raise exception 'Created assignment was not readable'; end if;
  update public.assignments set completed=true where assignment_id=chosen;
  if not exists (select 1 from public.assignments where assignment_id=chosen and completed=true) then
    raise exception 'Created assignment completion did not save';
  end if;
  begin
    update public.assignments set name='NOT ALLOWED' where assignment_id=chosen;
    raise exception 'Assignment name update was allowed';
  exception when insufficient_privilege then null;
  end;
end $check$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $check$
declare chosen bigint := current_setting('canvas.created_assignment')::bigint;
begin
  if exists (select 1 from public.assignments where assignment_id=chosen) then
    raise exception 'Another account could read the created assignment';
  end if;
  update public.assignments set completed=false where assignment_id=chosen;
  if found then raise exception 'Another account could update the created assignment'; end if;
end $check$;
rollback;
select 'PASS: creation, owner read/completion, denied name edit, other-account isolation; writes rolled back.' as result;
