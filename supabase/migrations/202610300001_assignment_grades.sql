-- Applied to uowlwdwrqceklbqjcnmc on October 30, 2026. Do not rerun there.
-- For a fresh project, run once after confirming the demo account and assignments 1-3.
-- Synthetic grade rows are readable by the shared account; the browser cannot write them.
begin;

create table public.assignment_grades (
  owner_id uuid not null references auth.users(id) on delete cascade,
  assignment_id bigint not null references public.assignments(assignment_id) on delete cascade,
  grade text,
  graded_at timestamptz,
  primary key (owner_id, assignment_id),
  constraint grade_and_time_together check ((grade is null) = (graded_at is null)),
  constraint nonblank_grade check (grade is null or (grade = btrim(grade) and char_length(grade) between 1 and 20))
);

alter table public.assignment_grades enable row level security;
revoke all on public.assignment_grades from public, anon, authenticated;
grant select (assignment_id, grade, graded_at) on public.assignment_grades to authenticated;

create policy read_own_assignment_grades on public.assignment_grades
  for select to authenticated using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.assignments a
      where a.assignment_id = assignment_grades.assignment_id and a.deleted = false
    )
  );

do $seed$
declare
  demo_uid constant uuid := 'a527cc80-a8d6-43d6-9a04-b62650a0d621';
begin
  if not exists (select 1 from auth.users where id = demo_uid) then
    raise exception 'Expected shared demo Auth account is missing.';
  end if;
  if (select count(*) from public.assignments
      where assignment_id in (1, 2, 3)
        and description = 'MODULE05 synthetic demo assignment; no real student data.'
        and deleted = false) <> 3 then
    raise exception 'Expected synthetic assignments 1-3 are missing or changed.';
  end if;
  insert into public.assignment_grades (owner_id, assignment_id, grade, graded_at) values
    (demo_uid, 1, 'B', '2026-10-12T18:00:00Z'),
    (demo_uid, 2, null, null),
    (demo_uid, 3, 'A-', '2026-10-15T18:00:00Z');
end $seed$;

commit;
