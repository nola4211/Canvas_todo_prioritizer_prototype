begin;
-- Break legacy circular delete cascades without deleting identities or other assignments.
-- These two columns are nullable; preserve their original ON UPDATE behavior.
alter table public."user" drop constraint user_assignment_user_id_fkey1,
  add constraint user_assignment_user_id_fkey1 foreign key (assignment_user_id)
  references public.user_assignment(user_assignment_id) on update cascade on delete set null;
alter table public.assignments drop constraint assignments_user_assignment_id_fkey,
  add constraint assignments_user_assignment_id_fkey foreign key (user_assignment_id)
  references public.user_assignment(user_assignment_id) on update cascade on delete set null;
commit;
