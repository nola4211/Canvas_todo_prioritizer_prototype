-- Let the signed-in student confirm a ready AI assignment in natural language.
-- The Edge Function calls this service-only function after it verifies the user.
begin;

create or replace function public.confirm_ai_assignment_from_chat(
  p_owner uuid,
  p_chat_id bigint,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  c public.chat;
  d jsonb;
  saved public.assignments;
  v_due timestamptz;
  v_minutes integer;
  v_priority integer;
begin
  select * into c
  from public.chat
  where "chat_ID"=p_chat_id and owner_id=p_owner
  for update;

  if not found or c.active_request is distinct from p_request_id then
    raise exception 'Conversation unavailable';
  end if;

  d:=c.assignment_draft;
  v_priority:=(d->>'priority')::integer;
  if d is null or d->>'status' is distinct from 'review'
    or nullif(btrim(d->>'name'),'') is null
    or nullif(btrim(d->>'class_name'),'') is null
    or v_priority not between 0 and 3 then
    raise exception 'Review a name, class, and priority before creating the assignment';
  end if;

  if char_length(btrim(d->>'name'))>200 or char_length(btrim(d->>'class_name'))>100 then
    raise exception 'Assignment details are too long';
  end if;

  if d->>'due_date' is not null then
    if (d->>'due_date')::date < (now() at time zone 'America/Denver')::date then
      raise exception 'Choose a due date today or later';
    end if;
    v_due:=(((d->>'due_date')::date)+time '23:59') at time zone 'America/Denver';
  end if;

  if d->>'estimated_minutes' is not null then
    v_minutes:=(d->>'estimated_minutes')::integer;
    if v_minutes not between 1 and 10080 then
      raise exception 'Estimated time must be between 1 minute and 7 days';
    end if;
    if v_minutes>600 then
      raise exception 'Use the review button to confirm an estimate over 10 hours';
    end if;
  end if;

  if d->>'percentage_of_grade' is not null
    and (d->>'percentage_of_grade')::numeric not between 0 and 100 then
    raise exception 'Grade weight must be from 0 to 100';
  end if;

  insert into public.assignments(
    name,class_name,due_date,est_time,optional,percentage_of_grade,priority,
    completed,deleted,client_request_id,owner_id
  ) values(
    btrim(d->>'name'),btrim(d->>'class_name'),v_due,
    case when v_minutes is null then null else make_interval(mins=>v_minutes) end,
    coalesce((d->>'optional')::boolean,false),
    case when d->>'grade_weight_answered'='true' then (d->>'percentage_of_grade')::numeric else null end,
    v_priority,false,false,p_request_id,p_owner
  ) returning * into saved;

  delete from public.assignments_draft
  where owner_id=p_owner and source_chat_id=p_chat_id;

  update public.chat
  set assignment_draft=d||jsonb_build_object('status','created','assignment_id',saved.assignment_id),
      active_request=null,
      locked_until=null,
      updated_at=now()
  where "chat_ID"=p_chat_id;

  update public.message
  set status='complete'
  where "chat_ID"=p_chat_id and request_id=p_request_id and role='user';

  insert into public.message("chat_ID",message,role,request_id,status)
  values(p_chat_id,'Assignment successfully saved!','assistant',p_request_id,'complete');

  return to_jsonb(saved);
end $$;

revoke all on function public.confirm_ai_assignment_from_chat(uuid,bigint,uuid)
from public,anon,authenticated;
grant execute on function public.confirm_ai_assignment_from_chat(uuid,bigint,uuid)
to service_role;

commit;
notify pgrst, 'reload schema';
