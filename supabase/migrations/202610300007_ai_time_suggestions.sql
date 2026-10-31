-- Per-account limit for optional AI time suggestions. The browser cannot read or write this table.
create table if not exists public.ai_time_suggestion_requests (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);
create index if not exists ai_time_suggestion_requests_owner_time
  on public.ai_time_suggestion_requests(owner_id, requested_at desc);
alter table public.ai_time_suggestion_requests enable row level security;
revoke all on public.ai_time_suggestion_requests from public, anon, authenticated;

create or replace function public.reserve_ai_time_suggestion() returns void
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Sign in to use AI suggestions'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  if (select count(*) from public.ai_time_suggestion_requests
      where owner_id = v_owner and requested_at > now() - interval '1 hour') >= 20 then
    raise exception 'Hourly AI estimate limit reached. Try again later.';
  end if;
  delete from public.ai_time_suggestion_requests
    where owner_id = v_owner and requested_at < now() - interval '1 day';
  insert into public.ai_time_suggestion_requests(owner_id) values (v_owner);
end;
$$;
revoke all on function public.reserve_ai_time_suggestion() from public, anon, authenticated;
grant execute on function public.reserve_ai_time_suggestion() to authenticated;
