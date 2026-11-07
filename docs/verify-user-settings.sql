-- Run after the user settings migration. All test changes are rolled back.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','a527cc80-a8d6-43d6-9a04-b62650a0d621',true);

do $$
declare
  found public.user_settings%rowtype;
begin
  insert into public.user_settings(push_notifications,sync_with_canvas,dark_mode)
    values (false,true,true)
    on conflict(owner_id) do update set
      push_notifications=excluded.push_notifications,
      sync_with_canvas=excluded.sync_with_canvas,
      dark_mode=excluded.dark_mode;

  select * into found from public.user_settings;
  if found.owner_id <> 'a527cc80-a8d6-43d6-9a04-b62650a0d621' or
     found.push_notifications <> false or found.sync_with_canvas <> true or found.dark_mode <> true then
    raise exception 'Settings save or readback failed';
  end if;

  update public.user_settings set push_notifications=true,dark_mode=false;
  if not exists(select 1 from public.user_settings where push_notifications=true and sync_with_canvas=true and dark_mode=false) then
    raise exception 'Settings update failed';
  end if;
end $$;

-- A different signed-in identity cannot see or change the first account's row.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare affected integer;
begin
  if exists(select 1 from public.user_settings where owner_id='a527cc80-a8d6-43d6-9a04-b62650a0d621') then
    raise exception 'Another identity could read settings';
  end if;
  update public.user_settings set dark_mode=true where owner_id='a527cc80-a8d6-43d6-9a04-b62650a0d621';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Another identity could update settings'; end if;
  begin
    insert into public.user_settings(owner_id) values ('a527cc80-a8d6-43d6-9a04-b62650a0d621');
    raise exception 'Another identity could insert settings for an account';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.user_settings;
    raise exception 'Signed-out settings read was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.user_settings default values;
    raise exception 'Signed-out settings insert was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'PASS: settings save/readback, updates, account isolation, ownership protection, and signed-out denial. Test changes rolled back.' as result;
