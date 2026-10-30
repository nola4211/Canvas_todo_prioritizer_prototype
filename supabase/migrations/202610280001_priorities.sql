-- Applied to uowlwdwrqceklbqjcnmc on October 28, 2026. Do not rerun there.
-- For a fresh project, apply once after the lists migration. Existing tasks and memberships are preserved.
begin;

-- An ordered JSON array keeps this small: [{"type":"title","text":"Exam"},{"type":"due"}].
-- Check values here as well as in JavaScript; browser validation is not security.
create function public.valid_priority_rules(rules jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  rule jsonb;
  rule_type text;
  rule_key text;
  seen text[] := array[]::text[];
begin
  if rules is null or jsonb_typeof(rules) <> 'array' then return false; end if;
  if jsonb_array_length(rules) > 10 then return false; end if;
  for rule in select value from jsonb_array_elements(rules) loop
    if jsonb_typeof(rule) <> 'object' then return false; end if;
    rule_type := rule->>'type';
    if rule_type is null or rule_type not in ('grade','due','title','time','class') then return false; end if;
    rule_key := rule_type;
    if rule_type = 'title' then
      if jsonb_typeof(rule->'text') is distinct from 'string' then return false; end if;
      if char_length(btrim(rule->>'text')) not between 1 and 80 or rule->>'text' <> btrim(rule->>'text') then return false; end if;
      if rule <> jsonb_build_object('type',rule_type,'text',rule->>'text') then return false; end if;
      rule_key := rule_type || ':' || lower(rule->>'text');
    elsif rule <> jsonb_build_object('type',rule_type) then return false;
    end if;
    if rule_key = any(seen) then return false; end if;
    seen := array_append(seen,rule_key);
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_priority_rules(jsonb) from public, anon;
grant execute on function public.valid_priority_rules(jsonb) to authenticated;

alter table public.lists
  add column priority_rules jsonb not null default '[]'::jsonb check (public.valid_priority_rules(priority_rules)),
  add column ignore_user_rules boolean not null default false;
grant update (priority_rules, ignore_user_rules) on public.lists to authenticated;

-- Each account can save one settings row and one row for each automatic view.
-- Custom list priorities live on the list itself, so deleting a list removes its priorities too.
create table public.user_priorities (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scope text not null check (scope in ('settings','main','classes')),
  rules jsonb not null default '[]'::jsonb check (public.valid_priority_rules(rules)),
  ignore_user_rules boolean not null default false,
  primary key (owner_id,scope),
  check (scope <> 'settings' or ignore_user_rules = false)
);
alter table public.user_priorities enable row level security;
revoke all on public.user_priorities from public, anon, authenticated;
grant select on public.user_priorities to authenticated;
grant insert (scope,rules,ignore_user_rules), update (scope,rules,ignore_user_rules) on public.user_priorities to authenticated;
create policy own_user_priorities on public.user_priorities for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
commit;
