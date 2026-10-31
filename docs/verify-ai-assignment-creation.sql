-- All test chats, messages, and assignments roll back. Run after migration 003.
begin;
select set_config('request.jwt.claim.sub','a527cc80-a8d6-43d6-9a04-b62650a0d621',true);
select set_config('request.jwt.claims','{"sub":"a527cc80-a8d6-43d6-9a04-b62650a0d621","role":"authenticated"}',true);
set local role authenticated;
do $$ declare c jsonb; blocked boolean:=false; begin
 c:=public.create_ai_chat('AI creation verification (rolled back)');
 perform set_config('test.ai_chat',c->>'id',true);
 perform public.begin_ai_turn((c->>'id')::bigint,'11111111-1111-4111-8111-111111111111','Prepare an assignment');
 begin update public.chat set assignment_draft='{"status":"review"}' where "chat_ID"=(c->>'id')::bigint;
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Browser can forge review';end if;
end $$;
reset role;
select public.finish_ai_turn('a527cc80-a8d6-43d6-9a04-b62650a0d621',current_setting('test.ai_chat')::bigint,'11111111-1111-4111-8111-111111111111','Review this assignment','test',jsonb_build_object('status','review','name','__ai_creation_verification__','class_name','IS 401','due_date',((now() at time zone 'America/Denver')::date+3)::text,'estimated_minutes',45,'optional',false,'percentage_of_grade',null,'grade_weight_answered',true,'time_source','student','estimate_allowed',false));
set local role authenticated;
do $$ declare d jsonb; a jsonb; retry jsonb; blocked boolean:=false; begin
 select assignment_draft into d from public.chat where "chat_ID"=current_setting('test.ai_chat')::bigint;
 perform set_config('test.ai_review',d->>'request_id',true);
 a:=public.confirm_ai_assignment(current_setting('test.ai_chat')::bigint,(d->>'request_id')::uuid);
 perform set_config('test.ai_assignment',a->>'assignment_id',true);
 if a->>'class_name'<>'IS 401' or a->>'owner_id'<>auth.uid()::text or a->>'completed'<>'false' or a->'percentage_of_grade'<>'null'::jsonb then raise exception 'Wrong saved fields';end if;
 retry:=public.confirm_ai_assignment(current_setting('test.ai_chat')::bigint,(d->>'request_id')::uuid);
 if retry->>'assignment_id'<>a->>'assignment_id' then raise exception 'Retry created a duplicate';end if;
 if (select count(*) from public.assignments where client_request_id=(d->>'request_id')::uuid)<>1 then raise exception 'Duplicate saved rows';end if;
 begin perform public.create_saved_assignment('Changed name','IS 401',(d->>'due_date')::date,45,false,null,(d->>'request_id')::uuid);
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Request ID accepted changed fields';end if;
end $$;
-- Starting another turn removes the old review before model output is available.
select public.begin_ai_turn(current_setting('test.ai_chat')::bigint,'22222222-2222-4222-8222-222222222222','Prepare a second assignment');
reset role;
select public.finish_ai_turn('a527cc80-a8d6-43d6-9a04-b62650a0d621',current_setting('test.ai_chat')::bigint,'22222222-2222-4222-8222-222222222222','More details needed','test',jsonb_build_object('status','review','name','Missing grade answer','class_name','History','due_date',((now() at time zone 'America/Denver')::date+3)::text,'estimated_minutes',45,'optional',false,'percentage_of_grade',null,'grade_weight_answered',false,'time_source','student','estimate_allowed',false));
set local role authenticated;
do $$ declare d jsonb; blocked boolean:=false; begin
 select assignment_draft into d from public.chat where "chat_ID"=current_setting('test.ai_chat')::bigint;
 begin perform public.confirm_ai_assignment(current_setting('test.ai_chat')::bigint,(d->>'request_id')::uuid);
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Unanswered grade weight allowed creation';end if;
 blocked:=false;
 begin perform public.confirm_ai_assignment(current_setting('test.ai_chat')::bigint,current_setting('test.ai_review')::uuid);
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Stale review allowed creation';end if;
 perform public.change_ai_assignment_draft(current_setting('test.ai_chat')::bigint,(d->>'request_id')::uuid,'edit');
 if (select assignment_draft->>'status' from public.chat where "chat_ID"=current_setting('test.ai_chat')::bigint)<>'collecting' then raise exception 'Edit did not invalidate review';end if;
 perform public.change_ai_assignment_draft(current_setting('test.ai_chat')::bigint,(d->>'request_id')::uuid,'cancel');
 if (select count(*) from public.assignments where name='Missing grade answer')<>0 then raise exception 'Cancel created assignment';end if;
 -- The common manual writer rejects invalid inputs too.
 blocked:=false;
 begin perform public.create_saved_assignment('Invalid grade','History',(now() at time zone 'America/Denver')::date,30,false,101,gen_random_uuid());exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Invalid grade allowed';end if;
 blocked:=false;
 begin perform public.create_saved_assignment('Invalid time','History',(now() at time zone 'America/Denver')::date,0,false,null,gen_random_uuid());exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Invalid time allowed';end if;
 blocked:=false;
 begin perform public.create_saved_assignment('Long estimate','History',(now() at time zone 'America/Denver')::date,601,false,null,gen_random_uuid());exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Long estimate without acknowledgement allowed';end if;
end $$;
do $$ declare a jsonb; begin
 a:=public.create_saved_assignment('__manual_writer_verification__','Math',(now() at time zone 'America/Denver')::date+3,60,true,25,gen_random_uuid());
 if (a->>'percentage_of_grade')::numeric<>25 or a->>'optional'<>'true' or a->>'priority'<>'0' or a->>'class_name'<>'Math' then raise exception 'Manual writer lost fields';end if;
 if to_char((a->>'due_date')::timestamptz at time zone 'America/Denver','HH24:MI')<>'23:59' then raise exception 'Wrong Denver end-of-day time';end if;
 update public.assignments set completed=true where assignment_id=(a->>'assignment_id')::bigint;
 if not exists(select 1 from public.assignments where assignment_id=(a->>'assignment_id')::bigint and completed=true) then raise exception 'New assignment completion failed';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare blocked boolean:=false; begin
 if exists(select 1 from public.chat where "chat_ID"=current_setting('test.ai_chat')::bigint) or exists(select 1 from public.assignments where assignment_id=current_setting('test.ai_assignment')::bigint) then raise exception 'Other account can read private data';end if;
 begin perform public.confirm_ai_assignment(current_setting('test.ai_chat')::bigint,current_setting('test.ai_review')::uuid);exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Other account can confirm review';end if;
end $$;
reset role;
rollback;
select 'PASS: shared creation, reviewed confirmation, retry identity, changed-input rejection, missing fields, stale reviews, edit/cancel, validation, and account privacy. All writes rolled back.' as result;
