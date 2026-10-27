-- Run AFTER the lists migration. All test writes are rolled back.
-- Uses the existing synthetic demo account and assignment 1.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a527cc80-a8d6-43d6-9a04-b62650a0d621', true);

do $$
declare
  first_list uuid;
  second_list uuid;
begin
  insert into public.lists(name) values ('__list_verification_first__') returning id into first_list;
  insert into public.lists(name) values ('__list_verification_second__') returning id into second_list;
  insert into public.list_assignments values (first_list,1), (second_list,1);
  if (select count(*) from public.list_assignments where assignment_id=1 and list_id in (first_list,second_list)) <> 2 then
    raise exception 'Multiple-list membership failed';
  end if;
  begin
    insert into public.list_assignments values (first_list,1);
    raise exception 'Duplicate membership was allowed';
  exception when unique_violation then null;
  end;
  begin
    insert into public.lists(name) values ('__LIST_VERIFICATION_FIRST__');
    raise exception 'Duplicate name was allowed';
  exception when unique_violation then null;
  end;
  begin
    insert into public.lists(name) values (' ');
    raise exception 'Blank name was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.lists(name) values (repeat('x',101));
    raise exception 'Long name was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.list_assignments values (first_list,9223372036854775807);
    raise exception 'Unreadable assignment was allowed';
  exception when insufficient_privilege then null;
  end;
  update public.lists set name='__list_verification_renamed__' where id=first_list;
  delete from public.list_assignments where list_id=first_list and assignment_id=1;
  insert into public.list_assignments values (first_list,1);
  delete from public.lists where id=first_list;
  if exists(select 1 from public.list_assignments where list_id=first_list) then
    raise exception 'List deletion did not remove memberships';
  end if;
  if not exists(select 1 from public.assignments where assignment_id=1) or
     not exists(select 1 from public.list_assignments where list_id=second_list and assignment_id=1) then
    raise exception 'List deletion changed an assignment or another list';
  end if;
  perform set_config('canvas.test_list',second_list::text,true);
end $$;

-- Another identity cannot read or change the owner's list or its memberships.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare
  target uuid := current_setting('canvas.test_list')::uuid;
  affected integer;
begin
  if exists(select 1 from public.lists where id=target) or
     exists(select 1 from public.list_assignments where list_id=target) then
    raise exception 'Another identity could read private lists';
  end if;
  update public.lists set name='Unauthorized' where id=target;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Another identity could rename the list'; end if;
  delete from public.list_assignments where list_id=target;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Another identity could remove membership'; end if;
  delete from public.lists where id=target;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Another identity could delete the list'; end if;
  begin
    insert into public.list_assignments values (target,1);
    raise exception 'Another identity could add membership';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.lists;
    raise exception 'Signed-out read was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.list_assignments values (current_setting('canvas.test_list')::uuid,1);
    raise exception 'Signed-out insert was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'PASS: list operations, validation, multiple membership, assignment preservation, other-identity isolation, and signed-out denial. Test changes rolled back.' as result;
