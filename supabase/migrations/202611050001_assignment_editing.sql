-- Allow authenticated owners to edit the same fields exposed by the assignment form.
-- The existing assignment_owner_complete policy still limits updates to owned, visible rows.
begin;
grant update (name, description, class_name, due_date, est_time, optional, percentage_of_grade, priority)
  on public.assignments to authenticated;
commit;
