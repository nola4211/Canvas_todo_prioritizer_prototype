-- Run after the priorities migration. All test changes are rolled back.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','a527cc80-a8d6-43d6-9a04-b62650a0d621',true);

do $$
declare
  test_list uuid;
  found_rules jsonb;
begin
  if not public.valid_priority_rules('[]') or
     not public.valid_priority_rules('[{"type":"title","text":"Exam"},{"type":"due"}]') or
     public.valid_priority_rules('null') or
     public.valid_priority_rules('{}') or
     public.valid_priority_rules('[{"type":"class_grade"}]') or
     public.valid_priority_rules('[{"type":"due"},{"type":"due"}]') or
     public.valid_priority_rules('[{"type":"title","text":" "}]') or
     public.valid_priority_rules('[{"type":"title","text":"Exam"},{"type":"title","text":"EXAM"}]') or
     public.valid_priority_rules(jsonb_build_array(jsonb_build_object('type','title','text',repeat('x',81)))) then
    raise exception 'Rule validation failed';
  end if;

  insert into public.user_priorities(scope,rules,ignore_user_rules)
    values ('settings','[{"type":"title","text":"Exam"}]',false)
    on conflict(owner_id,scope) do update set scope=excluded.scope,rules=excluded.rules,ignore_user_rules=excluded.ignore_user_rules;
  -- The browser uses this same upsert when saving an existing scope again.
  insert into public.user_priorities(scope,rules,ignore_user_rules)
    values ('settings','[{"type":"grade"},{"type":"due"}]',false)
    on conflict(owner_id,scope) do update set scope=excluded.scope,rules=excluded.rules,ignore_user_rules=excluded.ignore_user_rules;
  select rules into found_rules from public.user_priorities where scope='settings';
  if found_rules <> '[{"type":"grade"},{"type":"due"}]'::jsonb then raise exception 'Settings readback failed'; end if;
  insert into public.user_priorities(scope,rules,ignore_user_rules)
    values ('main','[{"type":"due"}]',true)
    on conflict(owner_id,scope) do update set scope=excluded.scope,rules=excluded.rules,ignore_user_rules=excluded.ignore_user_rules;
  insert into public.user_priorities(scope,rules,ignore_user_rules)
    values ('classes','[{"type":"grade"}]',false)
    on conflict(owner_id,scope) do update set scope=excluded.scope,rules=excluded.rules,ignore_user_rules=excluded.ignore_user_rules;

  begin
    update public.user_priorities set ignore_user_rules=true where scope='settings';
    raise exception 'Settings accepted an override of itself';
  exception when check_violation then null;
  end;
  begin
    update public.user_priorities set rules='[{"type":"title","text":""}]' where scope='main';
    raise exception 'Invalid rule was stored';
  exception when check_violation then null;
  end;
  begin
    update public.user_priorities set owner_id='11111111-1111-4111-8111-111111111111' where scope='main';
    raise exception 'Ownership update was allowed';
  exception when insufficient_privilege then null;
  end;

  insert into public.lists(name) values ('__priority_verification__') returning id into test_list;
  update public.lists set priority_rules='[{"type":"title","text":"readings"},{"type":"grade"}]',ignore_user_rules=true where id=test_list;
  if not exists(select 1 from public.lists where id=test_list and ignore_user_rules=true and priority_rules->0->>'text'='readings') then
    raise exception 'List priorities readback failed';
  end if;
  begin
    update public.lists set priority_rules='[{"type":"unsupported"}]' where id=test_list;
    raise exception 'List accepted an invalid rule';
  exception when check_violation then null;
  end;
  perform set_config('canvas.priority_test_list',test_list::text,true);
end $$;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare affected integer;
begin
  if exists(select 1 from public.user_priorities where owner_id='a527cc80-a8d6-43d6-9a04-b62650a0d621') then
    raise exception 'Another identity could read priorities';
  end if;
  update public.user_priorities set rules='[]' where owner_id='a527cc80-a8d6-43d6-9a04-b62650a0d621';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Another identity could update priorities'; end if;
  update public.lists set ignore_user_rules=false where id=current_setting('canvas.priority_test_list')::uuid;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Another identity could override list priorities'; end if;
  begin
    insert into public.user_priorities(owner_id,scope,rules) values ('a527cc80-a8d6-43d6-9a04-b62650a0d621','settings','[]');
    raise exception 'Another identity could insert under a different owner';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.user_priorities;
    raise exception 'Signed-out priorities read was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.lists set ignore_user_rules=true;
    raise exception 'Signed-out list update was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'PASS: priority saves/readback, scope separation, validation, list overrides, ownership protection, other-identity isolation, and signed-out denial. Test changes rolled back.' as result;
