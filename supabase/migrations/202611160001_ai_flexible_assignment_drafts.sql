-- AI assignments need only a name, class, and priority. Every active AI draft
-- is mirrored into assignments_draft so it appears in the app's Drafts page.
-- The chat JSON remains the source for review state; the mirror supplies the
-- editable Drafts list and is removed when the assignment is confirmed/cancelled.
begin;

alter table public.assignments drop constraint if exists assignment_created_fields;
alter table public.assignments add constraint assignment_created_fields check (
  owner_id is null or
  (name is not null and char_length(btrim(name)) between 1 and 200
    and class_name is not null and char_length(btrim(class_name)) between 1 and 100
    and priority is not null and priority between 0 and 3
    and client_request_id is not null)
);

alter table public.assignments_draft alter column name drop not null;
alter table public.assignments_draft add column if not exists source_chat_id bigint;
alter table public.assignments_draft drop constraint if exists assignments_draft_source_chat_fkey;
alter table public.assignments_draft add constraint assignments_draft_source_chat_fkey
  foreign key(source_chat_id) references public.chat("chat_ID") on delete cascade;
create unique index if not exists assignments_draft_owner_chat
  on public.assignments_draft(owner_id,source_chat_id) where source_chat_id is not null;
grant select(priority,source_chat_id) on public.assignments_draft to authenticated;
grant insert(priority,source_chat_id),update(priority,source_chat_id) on public.assignments_draft to authenticated;

-- Keep the existing shared writer compatible while allowing the manual form
-- to send an explicit priority instead of deriving it from Optional.
drop function public.create_saved_assignment(text,text,date,integer,boolean,numeric,uuid,boolean,boolean,text);
create function public.create_saved_assignment(
  p_name text,p_class_name text,p_due_date date,p_estimated_minutes integer,p_optional boolean,
  p_percentage_of_grade numeric,p_request_id uuid,p_completed boolean default false,
  p_confirm_long boolean default false,p_description text default null,p_priority integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.assignments; saved jsonb; updated public.assignments;
begin
  perform private.assert_browser_session();
  if p_priority is not null and p_priority not between 0 and 3 then raise exception 'Choose a valid priority'; end if;
  select * into existing from public.assignments where owner_id=auth.uid() and client_request_id=p_request_id;
  if found and p_priority is not null and existing.priority is distinct from p_priority then
    raise exception 'This request ID belongs to different assignment details';
  end if;
  saved:=private.create_saved_assignment_core(p_name,p_class_name,p_due_date,p_estimated_minutes,p_optional,
    p_percentage_of_grade,p_request_id,p_completed,p_confirm_long,p_description);
  if p_priority is null then return saved; end if;
  update public.assignments set priority=p_priority
    where assignment_id=(saved->>'assignment_id')::bigint and owner_id=auth.uid()
    returning * into updated;
  return to_jsonb(updated);
end $$;
revoke all on function public.create_saved_assignment(text,text,date,integer,boolean,numeric,uuid,boolean,boolean,text,integer) from public,anon;
grant execute on function public.create_saved_assignment(text,text,date,integer,boolean,numeric,uuid,boolean,boolean,text,integer) to authenticated;

-- Save the chat reply, chat draft, and Drafts-page row together.
create or replace function public.finish_ai_turn(
  p_owner uuid,p_chat_id bigint,p_request_id uuid,p_reply text,p_model text,p_draft jsonb default null
) returns void language plpgsql security definer set search_path='' as $$
declare c public.chat; v_draft_id bigint; v_due timestamptz;
begin
  select * into c from public.chat where "chat_ID"=p_chat_id and owner_id=p_owner for update;
  if not found or c.active_request is distinct from p_request_id then raise exception 'Reply no longer matches the active request'; end if;
  if p_reply is not null then
    insert into public.message("chat_ID",message,role,request_id,status,model)
      values(p_chat_id,p_reply,'assistant',p_request_id,'complete',p_model);
    if p_draft is not null then
      if jsonb_typeof(p_draft)<>'object' or p_draft->>'status' not in ('collecting','review') then raise exception 'Invalid assignment draft'; end if;
      if p_draft->>'due_date' is not null then
        v_due:=(((p_draft->>'due_date')::date)+time '23:59') at time zone 'America/Denver';
      end if;
      insert into public.assignments_draft(
        owner_id,name,class_name,due_date,est_time,optional,percentage_of_grade,priority,
        completed,deleted,client_request_id,source_chat_id
      ) values(
        p_owner,nullif(btrim(p_draft->>'name'),''),nullif(btrim(p_draft->>'class_name'),''),v_due,
        case when p_draft->>'estimated_minutes' is null then null else make_interval(mins=>(p_draft->>'estimated_minutes')::integer) end,
        case when p_draft->>'optional' is null then null else (p_draft->>'optional')::boolean end,
        case when p_draft->>'grade_weight_answered'='true' then (p_draft->>'percentage_of_grade')::numeric else null end,
        case when p_draft->>'priority' is null then null else (p_draft->>'priority')::integer end,
        false,false,gen_random_uuid(),p_chat_id
      ) on conflict(owner_id,source_chat_id) where source_chat_id is not null do update set
        name=excluded.name,class_name=excluded.class_name,due_date=excluded.due_date,est_time=excluded.est_time,
        optional=excluded.optional,percentage_of_grade=excluded.percentage_of_grade,priority=excluded.priority
      returning assignment_id into v_draft_id;
      update public.chat set assignment_draft=(p_draft-'request_id'-'assignment_id'-'draft_assignment_id')||
        jsonb_build_object('request_id',gen_random_uuid(),'draft_assignment_id',v_draft_id)
        where "chat_ID"=p_chat_id;
    end if;
  end if;
  update public.message set status=case when p_reply is null then 'failed' else 'complete' end
    where "chat_ID"=p_chat_id and request_id=p_request_id and role='user';
  update public.chat set active_request=null,locked_until=null,updated_at=now() where "chat_ID"=p_chat_id;
end $$;
revoke all on function public.finish_ai_turn(uuid,bigint,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_ai_turn(uuid,bigint,uuid,text,text,jsonb) to service_role;

create or replace function private.confirm_ai_assignment_browser_core(
  p_chat_id bigint,p_request_id uuid,p_confirm_long boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.chat; d jsonb; saved public.assignments; v_due timestamptz; v_minutes integer; v_priority integer;
begin
  select * into c from public.chat where "chat_ID"=p_chat_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Conversation unavailable'; end if;
  d:=c.assignment_draft;
  if d is null or d->>'request_id' is distinct from p_request_id::text then raise exception 'This review is out of date. Reload the conversation'; end if;
  if c.locked_until>now() then raise exception 'Wait for the current reply before confirming'; end if;
  if d->>'status'='created' then
    select * into saved from public.assignments where assignment_id=(d->>'assignment_id')::bigint and owner_id=auth.uid();
    return to_jsonb(saved);
  end if;
  v_priority:=(d->>'priority')::integer;
  if d->>'status' is distinct from 'review' or nullif(btrim(d->>'name'),'') is null
    or nullif(btrim(d->>'class_name'),'') is null or v_priority not between 0 and 3 then
    raise exception 'Add a name, class, and priority before creating the assignment';
  end if;
  if char_length(btrim(d->>'name'))>200 or char_length(btrim(d->>'class_name'))>100 then raise exception 'Assignment details are too long'; end if;
  if d->>'due_date' is not null then
    if (d->>'due_date')::date < (now() at time zone 'America/Denver')::date then raise exception 'Choose a due date today or later'; end if;
    v_due:=(((d->>'due_date')::date)+time '23:59') at time zone 'America/Denver';
  end if;
  if d->>'estimated_minutes' is not null then
    v_minutes:=(d->>'estimated_minutes')::integer;
    if v_minutes not between 1 and 10080 then raise exception 'Estimated time must be between 1 minute and 7 days'; end if;
    if v_minutes>600 and p_confirm_long is not true then raise exception 'Confirm the estimate over 10 hours before saving'; end if;
  end if;
  if d->>'percentage_of_grade' is not null and (d->>'percentage_of_grade')::numeric not between 0 and 100 then raise exception 'Grade weight must be from 0 to 100'; end if;
  insert into public.assignments(name,class_name,due_date,est_time,optional,percentage_of_grade,priority,
    completed,deleted,client_request_id,owner_id)
  values(btrim(d->>'name'),btrim(d->>'class_name'),v_due,
    case when v_minutes is null then null else make_interval(mins=>v_minutes) end,
    coalesce((d->>'optional')::boolean,false),
    case when d->>'grade_weight_answered'='true' then (d->>'percentage_of_grade')::numeric else null end,
    v_priority,false,false,p_request_id,auth.uid()) returning * into saved;
  delete from public.assignments_draft where owner_id=auth.uid() and source_chat_id=p_chat_id;
  update public.chat set assignment_draft=d||jsonb_build_object('status','created','assignment_id',saved.assignment_id),updated_at=now()
    where "chat_ID"=p_chat_id;
  insert into public.message("chat_ID",message,role,request_id,status)
    values(p_chat_id,'Assignment successfully saved!','assistant',p_request_id,'complete');
  return to_jsonb(saved);
end $$;

create or replace function private.change_ai_assignment_draft_browser_core(
  p_chat_id bigint,p_request_id uuid,p_action text
) returns void language plpgsql security definer set search_path='' as $$
declare c public.chat;
begin
  select * into c from public.chat where "chat_ID"=p_chat_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Conversation unavailable'; end if;
  if c.locked_until>now() then raise exception 'Wait for the current reply'; end if;
  if p_action not in ('edit','cancel') or c.assignment_draft->>'request_id' is distinct from p_request_id::text
    or c.assignment_draft->>'status' not in ('review','collecting') then raise exception 'This draft is no longer available'; end if;
  if p_action='cancel' then delete from public.assignments_draft where owner_id=auth.uid() and source_chat_id=p_chat_id; end if;
  update public.chat set assignment_draft=jsonb_set(c.assignment_draft,'{status}',to_jsonb(case when p_action='cancel' then 'cancelled' else 'collecting' end)),updated_at=now()
    where "chat_ID"=p_chat_id;
  insert into public.message("chat_ID",message,role,request_id,status)
    values(p_chat_id,case when p_action='cancel' then 'Draft cancelled. Your assignment wasn’t added.' else 'What would you like to change? Your assignment hasn’t been added yet.' end,'assistant',gen_random_uuid(),'complete');
end $$;

commit;
notify pgrst, 'reload schema';
