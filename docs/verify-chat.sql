-- Run in SQL Editor. Every test row is rolled back, including on failure.
begin;
select set_config('request.jwt.claim.sub','a527cc80-a8d6-43d6-9a04-b62650a0d621',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
declare c jsonb; start_result jsonb; blocked boolean:=false;
begin
 c:=public.create_ai_chat('Privacy verification (rolled back)');
 perform set_config('chat.test_id',c->>'id',true);
 if not exists(select 1 from public.chat where "chat_ID"=(c->>'id')::bigint) then raise exception 'Owner cannot read chat'; end if;
 begin insert into public.message("chat_ID",message,role,request_id) values((c->>'id')::bigint,'Forged reply','assistant',gen_random_uuid());
 exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Browser can forge replies'; end if;
 start_result:=public.begin_ai_turn((c->>'id')::bigint,'11111111-1111-4111-8111-111111111111','Test question');
 blocked:=false;
 begin perform public.begin_ai_turn((c->>'id')::bigint,'22222222-2222-4222-8222-222222222222','Concurrent question');
 exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Concurrent request was allowed'; end if;
 blocked:=false;
 begin perform public.finish_ai_turn(auth.uid(),(c->>'id')::bigint,'11111111-1111-4111-8111-111111111111','Forged','test');
 exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Browser can finalize replies'; end if;
end $$;
reset role;
select public.finish_ai_turn('a527cc80-a8d6-43d6-9a04-b62650a0d621',current_setting('chat.test_id')::bigint,'11111111-1111-4111-8111-111111111111','Verified reply','test');
set local role authenticated;
do $$ declare r jsonb; begin
 r:=public.begin_ai_turn(current_setting('chat.test_id')::bigint,'11111111-1111-4111-8111-111111111111','Test question');
 if r->>'reply'<>'Verified reply' or (r->>'cached')::boolean is not true then raise exception 'Retry did not reuse confirmed reply'; end if;
 if (select count(*) from public.message where "chat_ID"=current_setting('chat.test_id')::bigint)<>2 then raise exception 'Duplicate messages'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare blocked boolean:=false; begin
 if exists(select 1 from public.chat where "chat_ID"=current_setting('chat.test_id')::bigint) or exists(select 1 from public.message where "chat_ID"=current_setting('chat.test_id')::bigint) then raise exception 'Another account can read chat'; end if;
 begin perform public.begin_ai_turn(current_setting('chat.test_id')::bigint,gen_random_uuid(),'Other account'); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Other account can write chat'; end if;
end $$;
reset role;
rollback;
select 'PASS: owner read, other-account privacy, browser write denial, request lock, atomic save, retry caching, and no duplicates' as result;
