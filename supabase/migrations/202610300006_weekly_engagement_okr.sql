-- Track one authenticated app-open record per account per Denver calendar day.
-- The browser may record activity, but only administrators can read aggregates.
begin;

create table public.app_daily_activity (
  owner_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  open_count integer not null default 1 check (open_count > 0),
  primary key (owner_id, activity_date)
);

alter table public.app_daily_activity enable row level security;
revoke all on public.app_daily_activity from public, anon, authenticated;
grant all on public.app_daily_activity to service_role;

create or replace function public.record_app_open() returns date
language plpgsql security definer set search_path='' as $$
declare today date := (now() at time zone 'America/Denver')::date;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.app_daily_activity(owner_id,activity_date)
    values(auth.uid(),today)
  on conflict(owner_id,activity_date) do update
    set last_opened_at=now(),open_count=public.app_daily_activity.open_count+1;
  return today;
end $$;

create or replace function public.get_weekly_engagement_okr() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  today date := (now() at time zone 'America/Denver')::date;
  week_start date;
  active_start date;
  active_count integer;
  daily_count integer;
  trend jsonb;
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
    raise exception 'Administrator access required';
  end if;
  week_start := today-6;
  active_start := today-29;

  select count(distinct owner_id) into active_count
  from public.app_daily_activity
  where activity_date between active_start and today;

  select count(*) into daily_count
  from (
    select owner_id
    from public.app_daily_activity
    where activity_date between week_start and today
    group by owner_id
    having count(distinct activity_date)=7
  ) daily_users;

  select coalesce(jsonb_agg(jsonb_build_object('date',days.day::date,'users',coalesce(counts.users,0)) order by days.day),'[]'::jsonb)
    into trend
  from generate_series(week_start,today,interval '1 day') days(day)
  left join (
    select activity_date,count(distinct owner_id) users
    from public.app_daily_activity
    where activity_date between week_start and today
    group by activity_date
  ) counts on counts.activity_date=days.day::date;

  return jsonb_build_object(
    'goal_percent',75,
    'engagement_percent',case when active_count=0 then 0 else round(100.0*daily_count/active_count,1) end,
    'daily_users',daily_count,
    'active_users',active_count,
    'week_start',week_start,
    'week_end',today,
    'active_window_days',30,
    'goal_met',active_count>0 and 100.0*daily_count/active_count>=75,
    'daily_trend',trend
  );
end $$;

revoke all on function public.record_app_open(),public.get_weekly_engagement_okr() from public,anon,authenticated;
grant execute on function public.record_app_open(),public.get_weekly_engagement_okr() to authenticated;

commit;
