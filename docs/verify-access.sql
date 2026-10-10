-- Run AFTER the approved setup. Tests database role/claim enforcement.
-- The completion change is rolled back; this does not replace browser testing.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','a527cc80-a8d6-43d6-9a04-b62650a0d621',true);
select set_config('request.jwt.claims','{"sub":"a527cc80-a8d6-43d6-9a04-b62650a0d621","role":"authenticated"}',true);
do $check$
declare changed integer; selected_id bigint;
begin
  if (select count(*) from public.assignments) <> 3 then
    raise exception 'FAIL: demo account cannot see exactly three assignments.';
  end if;
  select min(assignment_id) into selected_id from public.assignments;
  update public.assignments set completed = not completed where assignment_id=selected_id;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'FAIL: completion update did not affect exactly one row.'; end if;
  begin
    update public.assignments set name='NOT ALLOWED' where assignment_id=selected_id;
    raise exception 'FAIL: name update was allowed.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assignments(name,deleted,completed) values ('NOT ALLOWED',false,false);
    raise exception 'FAIL: assignment insertion was allowed.';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.assignments where assignment_id=selected_id;
    raise exception 'FAIL: assignment deletion was allowed.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform user_id from public."user";
    raise exception 'FAIL: private user-table read was allowed.';
  exception when insufficient_privilege then null;
  end;
end $check$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $check$
declare changed integer;
begin
  if (select count(*) from public.assignments) <> 0 then raise exception 'FAIL: other authenticated identity saw demo rows.'; end if;
  update public.assignments set completed=true;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: other authenticated identity changed demo rows.'; end if;
end $check$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $check$
begin
  begin
    perform assignment_id from public.assignments;
    raise exception 'FAIL: signed-out read was allowed.';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.assignments set completed=true;
    raise exception 'FAIL: signed-out update was allowed.';
  exception when insufficient_privilege then null;
  end;
end $check$;
rollback;
select 'PASS: shared-account read/completion, denied name/insert/delete/user-table access, denied other identity, denied signed-out access; test writes rolled back.' as result;
