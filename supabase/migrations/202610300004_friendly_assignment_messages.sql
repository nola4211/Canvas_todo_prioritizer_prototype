-- Use friendly confirmation wording without rewriting saved conversations.
begin;
create or replace function public.confirm_ai_assignment(p_chat_id bigint,p_request_id uuid,p_confirm_long boolean default false) returns jsonb
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
 insert into public.message("chat_ID",message,role,request_id,status) values(p_chat_id,'Assignment successfully saved!','assistant',p_request_id,'complete');
 return saved;
end $$;
revoke all on function public.confirm_ai_assignment(bigint,uuid,boolean) from public,anon;
grant execute on function public.confirm_ai_assignment(bigint,uuid,boolean) to authenticated;

create or replace function public.change_ai_assignment_draft(p_chat_id bigint,p_request_id uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.chat;
begin
 select * into c from public.chat where "chat_ID"=p_chat_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 if c.locked_until>now() then raise exception 'Wait for the current reply'; end if;
 if p_action not in ('edit','cancel') or c.assignment_draft->>'request_id' is distinct from p_request_id::text or c.assignment_draft->>'status' not in ('review','collecting') then raise exception 'This draft is no longer available'; end if;
 update public.chat set assignment_draft=jsonb_set(c.assignment_draft,'{status}',to_jsonb(case when p_action='cancel' then 'cancelled' else 'collecting' end)),updated_at=now() where "chat_ID"=p_chat_id;
 insert into public.message("chat_ID",message,role,request_id,status) values(p_chat_id,case when p_action='cancel' then 'Draft cancelled. Your assignment wasn’t added.' else 'What would you like to change? Your assignment hasn’t been added yet.' end,'assistant',gen_random_uuid(),'complete');
end $$;
revoke all on function public.change_ai_assignment_draft(bigint,uuid,text) from public,anon;
grant execute on function public.change_ai_assignment_draft(bigint,uuid,text) to authenticated;
commit;
