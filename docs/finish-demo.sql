-- APPLIED successfully after Cameron's explicit approval, October 9, 2026.
-- Historical one-time operation. Do not rerun against the changed schema.
-- Adds three synthetic rows per existing table; does not create tables or users.
-- Stops if any table has data, any policies exist, or the demo Auth user is absent.
-- Limits browser access to this shared account and the three new assignment IDs.
begin;
do $demo$
declare
  demo_uid constant uuid := 'a527cc80-a8d6-43d6-9a04-b62650a0d621';
  task_table_name text;
  column_names text;
  row_count bigint;
  tables text[] := array['assignments','Class','Class_User','user','user_assignment','chat_history'];
  demo_ids bigint[] := array[]::bigint[];
  new_class_id smallint;
  new_user_id bigint;
  new_assignment_id bigint;
  new_link_id bigint;
  i integer;
begin
  if not exists(select 1 from auth.users where id=demo_uid) then
    raise exception 'Expected demo Auth account is missing.';
  end if;
  -- Lock the existing tables to avoid racing a teammate's insert.
  foreach task_table_name in array tables loop
    execute format('lock table public.%I in share row exclusive mode',task_table_name);
    execute format('select count(*) from public.%I',task_table_name) into row_count;
    if row_count <> 0 then
      raise exception 'Table % is no longer empty. Stop and coordinate with the team.',task_table_name;
    end if;
  end loop;
  if exists(select 1 from pg_policies where schemaname='public' and tablename=any(tables)) then
    raise exception 'Existing policies found; preserve them and review with the team.';
  end if;
  if exists(select 1 from pg_views where schemaname='public') or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') then
    raise exception 'Public views/functions appeared since inspection; review their access first.';
  end if;
  for i in 1..3 loop
    insert into public."Class" ("ClassName",course_code,"section_ID",created_at)
      values ((array['IS 401 Demo','History Demo','Composition Demo'])[i],(array['IS401-DEMO','HIST-DEMO','ENG-DEMO'])[i],1,now()) returning "Class_ID" into new_class_id;
    insert into public."user" (first_name,last_name,student_email)
      values ('Demo',(array['One','Two','Three'])[i],'module05-demo-'||i||'@example.invalid') returning user_id into new_user_id;
    insert into public."Class_User" ("user_ID","class_ID") values (new_user_id,new_class_id);
    insert into public.assignments (name,percentage_of_grade,deleted,completed,priority,due_date,description,est_time)
      values ((array['Demo: IS401 Exam','Demo: Chapter Readings','Demo: Project Draft'])[i],(array[25,5,15])[i],false,false,(array[3,1,2])[i],
      (array['2026-10-11T05:59:00Z','2026-10-12T05:59:00Z','2026-10-13T05:59:00Z'])[i]::timestamptz,
      'MODULE05 synthetic demo assignment; no real student data.',(array['01:00:00','00:30:00','02:00:00'])[i]::interval)
      returning assignment_id into new_assignment_id;
    insert into public.user_assignment (assignment_id,user_id) values (new_assignment_id,new_user_id) returning user_assignment_id into new_link_id;
    -- Complete the existing nullable circular links on ONLY rows inserted above.
    update public.assignments set user_assignment_id=new_link_id where assignment_id=new_assignment_id;
    update public."user" set assignment_user_id=new_link_id where user_id=new_user_id;
    insert into public.chat_history (message_content) values ('MODULE05 synthetic message '||i||': prioritize the demo assignments.');
    demo_ids := array_append(demo_ids,new_assignment_id);
  end loop;
  foreach task_table_name in array tables loop
    execute format('alter table public.%I enable row level security',task_table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated',task_table_name);
    select string_agg(format('%I',column_name),', ') into column_names
      from information_schema.columns where table_schema='public' and information_schema.columns.table_name=task_table_name;
    execute format('revoke select (%s), insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',column_names,column_names,column_names,column_names,task_table_name);
  end loop;
  grant select (assignment_id,name,percentage_of_grade,completed,priority,due_date,est_time,deleted) on public.assignments to authenticated;
  grant update (completed) on public.assignments to authenticated;
  execute format('create policy module05_demo_read on public.assignments for select to authenticated using ((select auth.uid()) = %L::uuid and assignment_id = any(%L::bigint[]) and deleted = false)',demo_uid,demo_ids);
  execute format('create policy module05_demo_complete on public.assignments for update to authenticated using ((select auth.uid()) = %L::uuid and assignment_id = any(%L::bigint[]) and deleted = false) with check ((select auth.uid()) = %L::uuid and assignment_id = any(%L::bigint[]) and deleted = false)',demo_uid,demo_ids,demo_uid,demo_ids);
end $demo$;
commit;
select assignment_id,name,completed from public.assignments where description='MODULE05 synthetic demo assignment; no real student data.' order by assignment_id;
