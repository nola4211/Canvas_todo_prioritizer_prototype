-- Append INSIDE the migration's rollback-only rehearsal transaction.
-- Synthetic users and data are rolled back; no existing student records used.
do $acceptance$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 aid bigint; bid bigint; result jsonb; session_id uuid; n bigint;
 issuer text:='https://uowlwdwrqceklbqjcnmc.supabase.co/auth/v1';
 resource text:='https://uowlwdwrqceklbqjcnmc.supabase.co/functions/v1/student-mcp';
begin
 insert into auth.users(id) values(a),(b);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','iss',issuer,'aud','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 result:=public.create_saved_assignment('MCP rollback test A','Synthetic',current_date+20,45,false,10,gen_random_uuid(),false,false,'Synthetic only');
 aid:=(result->>'assignment_id')::bigint;
 if aid is null then raise exception 'Browser task creation failed'; end if;
 result:=public.student_agent_approve_browser('rollback-test','Rollback test');
 if result->>'ok' is distinct from 'true' then raise exception 'A consent failed: %',result; end if;
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','iss',issuer,'aud','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 result:=public.create_saved_assignment('MCP rollback test B','Synthetic',current_date+20,45,false,null,gen_random_uuid(),false,false,null);
 bid:=(result->>'assignment_id')::bigint;
 result:=public.student_agent_approve_browser('rollback-test','Rollback test');
 if result->>'ok' is distinct from 'true' then raise exception 'B consent failed'; end if;
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','client_id','rollback-test','iss',issuer,'aud',resource)::text,true);
 perform set_config('role','authenticated',true);
 result:=public.student_mcp_get_assignment(aid);
 if result->>'ok' is distinct from 'true' then raise exception 'Owned read failed: %',result; end if;
 result:=public.student_mcp_get_assignment(bid);
 if result->>'error_code' is distinct from 'NOT_FOUND' then raise exception 'Cross-account read not denied'; end if;
 result:=public.student_mcp_get_assignment(9223372036854775806);
 if result->>'error_code' is distinct from 'NOT_FOUND' then raise exception 'Absent ID response differs'; end if;
 result:=public.student_mcp_list_lists();
 if result->>'ok' is distinct from 'true' then raise exception 'List read failed'; end if;
 select count(*) into n from public.assignments;
 if n<>0 then raise exception 'Direct assignment read bypass'; end if;
 select count(*) into n from public.chat;
 if n<>0 then raise exception 'Direct chat read bypass'; end if;
 select count(*) into n from storage.objects;
 if n<>0 then raise exception 'Direct Storage read bypass'; end if;
 begin
  perform public.create_ai_chat('Denied'); raise exception 'Browser chat RPC bypass';
 exception when raise_exception then if sqlerrm<>'DELEGATED_TOKEN_BLOCKED' then raise; end if; end;
 begin
  perform public.remove_saved_assignment(aid); raise exception 'Delete RPC bypass';
 exception when raise_exception then if sqlerrm<>'DELEGATED_TOKEN_BLOCKED' then raise; end if; end;
 begin
  perform private.create_saved_assignment_core('Denied','Synthetic',current_date+20,45,false,null,gen_random_uuid(),false,false,null);
  raise exception 'Private helper bypass';
 exception when insufficient_privilege then null; end;
 result:=public.student_mcp_set_assignment_completion(aid,true,false);
 if result->>'ok' is distinct from 'true' then raise exception 'Completion failed: %',result; end if;
 result:=public.student_mcp_create_study_session(aid,date_trunc('day',now())+interval '2 days 10 hours',date_trunc('day',now())+interval '2 days 11 hours','UTC',gen_random_uuid(),false);
 if result->>'ok' is distinct from 'true' then raise exception 'Session creation failed: %',result; end if;
 session_id:=(result->'data'->>'id')::uuid;
 if session_id is null then raise exception 'Session ID missing'; end if;
 result:=public.student_mcp_cancel_study_session(session_id,1);
 if result->>'ok' is distinct from 'true' then raise exception 'Session cancellation failed: %',result; end if;
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','iss',issuer,'aud','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 result:=public.student_agent_revoke_client_browser('rollback-test');
 if result->>'ok' is distinct from 'true' then raise exception 'Revoke failed'; end if;
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','client_id','rollback-test','iss',issuer,'aud',resource)::text,true);
 perform set_config('role','authenticated',true);
 result:=public.student_mcp_get_assignment(aid);
 if result->>'error_code' is distinct from 'ACCESS_REVOKED' then raise exception 'Revoked token still allowed'; end if;
 perform set_config('role','postgres',true);
 -- Hosted project postgres cannot impersonate Supabase's managed Auth role.
 -- Check its ACLs directly; exercise hook transformations as the reviewer role.
 if not has_schema_privilege('supabase_auth_admin','public','usage')
 or not has_table_privilege('supabase_auth_admin','public.student_agent_runtime_config','select')
 or not has_function_privilege('supabase_auth_admin','public.student_mcp_access_token_hook(jsonb)','execute') then
  raise exception 'Required Auth hook privileges missing';
 end if;
 result:=public.student_mcp_access_token_hook(jsonb_build_object('claims',jsonb_build_object('sub',a,'aud','authenticated','role','authenticated')));
 if result->'claims'->>'aud' is distinct from 'authenticated' then raise exception 'Hook changed regular app audience'; end if;
 result:=public.student_mcp_access_token_hook(jsonb_build_object('claims',jsonb_build_object('sub',a,'aud','authenticated','role','authenticated','client_id','rollback-test')));
 if result->'claims'->>'aud' is distinct from resource or result->'claims'->>'sub' is distinct from a::text then raise exception 'OAuth hook claims failed'; end if;
 perform set_config('role','postgres',true);
end $acceptance$;
