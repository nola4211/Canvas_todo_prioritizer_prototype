begin;
-- Limit new and changed due dates using the student's Denver calendar date.
-- Existing out-of-range dates remain editable when left unchanged.
create function private.enforce_assignment_due_horizon() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.due_date is not null
     and (tg_op = 'INSERT' or new.due_date is distinct from old.due_date)
     and (new.due_date at time zone 'America/Denver')::date >
       (((statement_timestamp() at time zone 'America/Denver')::date + interval '1 year')::date) then
    raise exception 'Choose a due date no more than one year from today';
  end if;
  return new;
end $$;
revoke all on function private.enforce_assignment_due_horizon() from public, anon, authenticated;
create trigger assignment_due_horizon before insert or update of due_date on public.assignments
for each row execute function private.enforce_assignment_due_horizon();
commit;
