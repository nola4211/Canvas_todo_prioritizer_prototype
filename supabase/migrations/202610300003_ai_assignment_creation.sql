-- Apply once after the assignment-creation and AI-chat migrations.
-- Class is a user-entered label for now, not a Canvas course or Class-table link.
begin;
alter table public.assignments add column class_name text not null default 'Shared demo';
alter table public.assignments add constraint saved_assignment_details check (
 owner_id is null or (char_length(btrim(class_name)) between 1 and 100
 and (percentage_of_grade is null or percentage_of_grade between 0 and 100)
 and (est_time is null or est_time between interval '1 minute' and interval '7 days'))
);
grant select(class_name),insert(class_name) on public.assignments to authenticated;
alter table public.chat add column assignment_draft jsonb;

-- One writer for both paths. The caller cannot choose an owner.
create function public.create_saved_assignment(p_name text,p_class_name text,p_due_date date,p_estimated_minutes integer,p_optional boolean,p_percentage_of_grade numeric,p_request_id uuid,p_completed boolean default false,p_confirm_long boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.assignments; due_at timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in before creating an assignment'; end if;
 if p_request_id is null then raise exception 'Missing save request ID'; end if;
 due_at:=(p_due_date+time '23:59') at time zone 'America/Denver';
 -- Serialize retries for this request. Different accounts still cannot read each other's rows.
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text||p_request_id::text));
 select * into saved from public.assignments where client_request_id=p_request_id and owner_id=auth.uid();
 if found then
  if saved.name is distinct from btrim(p_name) or saved.class_name is distinct from btrim(p_class_name)
   or saved.due_date is distinct from due_at or saved.est_time is distinct from make_interval(mins=>p_estimated_minutes)
   or saved.optional is distinct from p_optional or saved.percentage_of_grade is distinct from p_percentage_of_grade then
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
 insert into public.assignments(name,class_name,due_date,est_time,optional,percentage_of_grade,priority,completed,deleted,client_request_id,owner_id)
 values(btrim(p_name),btrim(p_class_name),due_at,make_interval(mins=>p_estimated_minutes),p_optional,p_percentage_of_grade,case when p_optional then 0 else 2 end,coalesce(p_completed,false),false,p_request_id,auth.uid()) returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.create_saved_assignment(text,text,date,integer,boolean,numeric,uuid,boolean,boolean) from public,anon;
grant execute on function public.create_saved_assignment(text,text,date,integer,boolean,numeric,uuid,boolean,boolean) to authenticated;

-- Any new question or retry invalidates the old review before the model runs.
create function public.invalidate_assignment_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role='user' and new.status='pending' then
  update public.chat set assignment_draft=jsonb_set(assignment_draft,'{status}','"collecting"')
   where "chat_ID"=new."chat_ID" and assignment_draft->>'status'='review';
 end if;
 return new;
end $$;
revoke all on function public.invalidate_assignment_review() from public,anon,authenticated;
create trigger invalidate_assignment_review before insert or update on public.message for each row execute function public.invalidate_assignment_review();

-- Replace the old finalizer; default p_draft keeps older deployments compatible.
drop function public.finish_ai_turn(uuid,bigint,uuid,text,text);
create function public.finish_ai_turn(p_owner uuid,p_chat_id bigint,p_request_id uuid,p_reply text,p_model text,p_draft jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare c public.chat;
begin
 select * into c from public.chat where "chat_ID"=p_chat_id and owner_id=p_owner for update;
 if not found or c.active_request is distinct from p_request_id then raise exception 'Reply no longer matches the active request'; end if;
 if p_reply is not null then
  insert into public.message("chat_ID",message,role,request_id,status,model) values(p_chat_id,p_reply,'assistant',p_request_id,'complete',p_model);
  if p_draft is not null then
   if jsonb_typeof(p_draft)<>'object' or p_draft->>'status' not in ('collecting','review') then raise exception 'Invalid assignment draft'; end if;
   -- The server, never the model, supplies the immutable save request ID.
   update public.chat set assignment_draft=(p_draft-'request_id'-'assignment_id')||jsonb_build_object('request_id',gen_random_uuid()) where "chat_ID"=p_chat_id;
  end if;
 end if;
 update public.message set status=case when p_reply is null then 'failed' else 'complete' end where "chat_ID"=p_chat_id and request_id=p_request_id and role='user';
 update public.chat set active_request=null,locked_until=null,updated_at=now() where "chat_ID"=p_chat_id;
end $$;
revoke all on function public.finish_ai_turn(uuid,bigint,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_ai_turn(uuid,bigint,uuid,text,text,jsonb) to service_role;

-- Confirm only the server-saved, current review. The browser cannot submit replacement fields.
create function public.confirm_ai_assignment(p_chat_id bigint,p_request_id uuid,p_confirm_long boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.chat; d jsonb; saved jsonb;
begin
 select * into c from public.chat where "chat_ID"=p_chat_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 d:=c.assignment_draft;
 if d is null or d->>'request_id' is distinct from p_request_id::text then raise exception 'This review is out of date. Reload the conversation'; end if;
 if c.locked_until>now() then raise exception 'Wait for the current reply before confirming'; end if;
 if d->>'status'='created' then
  select to_jsonb(a) into saved from public.assignments a where a.assignment_id=(d->>'assignment_id')::bigint and a.owner_id=auth.uid();
  return saved;
 end if;
 if d->>'status' is distinct from 'review' or d->>'grade_weight_answered' is distinct from 'true'
  or d->>'time_source' is null or d->>'time_source' not in ('student','ai_estimate')
  or (d->>'time_source'='ai_estimate' and d->>'estimate_allowed' is distinct from 'true') then raise exception 'Answer the missing questions before creating an assignment'; end if;
 saved:=public.create_saved_assignment(d->>'name',d->>'class_name',(d->>'due_date')::date,(d->>'estimated_minutes')::integer,(d->>'optional')::boolean,(d->>'percentage_of_grade')::numeric,p_request_id,false,p_confirm_long);
 update public.chat set assignment_draft=d||jsonb_build_object('status','created','assignment_id',saved->>'assignment_id'),updated_at=now() where "chat_ID"=p_chat_id;
 insert into public.message("chat_ID",message,role,request_id,status) values(p_chat_id,'Created assignment: '||(saved->>'name')||'. Saved to Supabase.','assistant',p_request_id,'complete');
 return saved;
end $$;
revoke all on function public.confirm_ai_assignment(bigint,uuid,boolean) from public,anon;
grant execute on function public.confirm_ai_assignment(bigint,uuid,boolean) to authenticated;

create function public.change_ai_assignment_draft(p_chat_id bigint,p_request_id uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.chat;
begin
 select * into c from public.chat where "chat_ID"=p_chat_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 if c.locked_until>now() then raise exception 'Wait for the current reply'; end if;
 if p_action not in ('edit','cancel') or c.assignment_draft->>'request_id' is distinct from p_request_id::text or c.assignment_draft->>'status' not in ('review','collecting') then raise exception 'This draft is no longer available'; end if;
 update public.chat set assignment_draft=jsonb_set(c.assignment_draft,'{status}',to_jsonb(case when p_action='cancel' then 'cancelled' else 'collecting' end)),updated_at=now() where "chat_ID"=p_chat_id;
 insert into public.message("chat_ID",message,role,request_id,status) values(p_chat_id,case when p_action='cancel' then 'Assignment draft cancelled. Nothing was created.' else 'Assignment review reopened for changes. Nothing was created.' end,'assistant',gen_random_uuid(),'complete');
end $$;
revoke all on function public.change_ai_assignment_draft(bigint,uuid,text) from public,anon;
grant execute on function public.change_ai_assignment_draft(bigint,uuid,text) to authenticated;
commit;
