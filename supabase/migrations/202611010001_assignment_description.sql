-- Apply once after the existing assignment creation migration.
-- Replaces the writer with a compatible version that stores the optional description.
begin;

grant select (description) on public.assignments to authenticated;

drop function public.create_saved_assignment(text,text,date,integer,boolean,numeric,uuid,boolean,boolean);

create function public.create_saved_assignment(
 p_name text,
 p_class_name text,
 p_due_date date,
 p_estimated_minutes integer,
 p_optional boolean,
 p_percentage_of_grade numeric,
 p_request_id uuid,
 p_completed boolean default false,
 p_confirm_long boolean default false,
 p_description text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 saved public.assignments;
 due_at timestamptz;
 normalized_description text := nullif(btrim(p_description),'');
begin
 if auth.uid() is null then raise exception 'Sign in before creating an assignment'; end if;
 if p_request_id is null then raise exception 'Missing save request ID'; end if;
 if p_description is not null and char_length(p_description)>2000 then raise exception 'Keep the description under 2,000 characters'; end if;
 due_at:=(p_due_date+time '23:59') at time zone 'America/Denver';
 -- Retries return the same row only when all saved details still match.
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text||p_request_id::text));
 select * into saved from public.assignments where client_request_id=p_request_id and owner_id=auth.uid();
 if found then
  if saved.name is distinct from btrim(p_name) or saved.class_name is distinct from btrim(p_class_name)
   or saved.due_date is distinct from due_at or saved.est_time is distinct from make_interval(mins=>p_estimated_minutes)
   or saved.optional is distinct from p_optional or saved.percentage_of_grade is distinct from p_percentage_of_grade
   or saved.description is distinct from normalized_description then
   raise exception 'This request ID belongs to different assignment details';
  end if;
  return to_jsonb(saved);
 end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 200 then raise exception 'Use an assignment name between 1 and 200 characters'; end if;
 if p_class_name is null or char_length(btrim(p_class_name)) not between 1 and 100 then raise exception 'Enter a class name between 1 and 100 characters'; end if;
 if p_due_date is null or p_due_date<(now() at time zone 'America/Denver')::date then raise exception 'Choose a due date today or later'; end if;
 if p_estimated_minutes is null or p_estimated_minutes not between 1 and 10080 then raise exception 'Estimated time must be between 1 minute and 7 days'; end if;
 if p_estimated_minutes>600 and p_confirm_long is not true then raise exception 'Confirm the estimate over 10 hours before saving'; end if;
 if p_optional is null then raise exception 'Choose whether this assignment is optional'; end if;
 if p_percentage_of_grade is not null and (p_percentage_of_grade not between 0 and 100 or p_percentage_of_grade::text in ('NaN','Infinity','-Infinity')) then raise exception 'Grade weight must be from 0 to 100, or unknown'; end if;
 insert into public.assignments(name,description,class_name,due_date,est_time,optional,percentage_of_grade,priority,completed,deleted,client_request_id,owner_id)
 values(btrim(p_name),normalized_description,btrim(p_class_name),due_at,make_interval(mins=>p_estimated_minutes),p_optional,p_percentage_of_grade,case when p_optional then 0 else 2 end,coalesce(p_completed,false),false,p_request_id,auth.uid()) returning * into saved;
 return to_jsonb(saved);
end $$;

revoke all on function public.create_saved_assignment(text,text,date,integer,boolean,numeric,uuid,boolean,boolean,text) from public,anon;
grant execute on function public.create_saved_assignment(text,text,date,integer,boolean,numeric,uuid,boolean,boolean,text) to authenticated;

commit;
notify pgrst, 'reload schema';
