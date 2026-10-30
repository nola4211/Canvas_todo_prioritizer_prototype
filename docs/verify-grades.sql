-- Read-only access check for the synthetic Supabase grade table.
begin;
do $check$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.assignment_grades'::regclass) then
    raise exception 'FAIL: assignment_grades RLS is disabled.';
  end if;
end $check$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a527cc80-a8d6-43d6-9a04-b62650a0d621',true);
select set_config('request.jwt.claims','{"sub":"a527cc80-a8d6-43d6-9a04-b62650a0d621","role":"authenticated"}',true);
do $check$
begin
  if (select count(assignment_id) from public.assignment_grades) <> 3 then
    raise exception 'FAIL: demo account cannot read all three synthetic grade rows.';
  end if;
  if not exists (select 1 from public.assignment_grades where assignment_id = 1 and grade = 'B' and graded_at is not null) then
    raise exception 'FAIL: graded synthetic assignment is missing.';
  end if;
  if not exists (select 1 from public.assignment_grades where assignment_id = 2 and grade is null and graded_at is null) then
    raise exception 'FAIL: pending synthetic assignment is missing.';
  end if;
  if has_table_privilege(current_user,'public.assignment_grades','INSERT')
     or has_table_privilege(current_user,'public.assignment_grades','UPDATE')
     or has_table_privilege(current_user,'public.assignment_grades','DELETE') then
    raise exception 'FAIL: browser role can write grades.';
  end if;
end $check$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $check$
begin
  if (select count(assignment_id) from public.assignment_grades) <> 0 then
    raise exception 'FAIL: another account can read demo grades.';
  end if;
end $check$;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $check$
begin
  begin
    perform grade from public.assignment_grades;
    raise exception 'FAIL: signed-out grade read was allowed.';
  exception when insufficient_privilege then null;
  end;
end $check$;
rollback;
select 'PASS: demo read, pending grade, RLS, denied writes, other-account isolation, and signed-out denial.' as result;
