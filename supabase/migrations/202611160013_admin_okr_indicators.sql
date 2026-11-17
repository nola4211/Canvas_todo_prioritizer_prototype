-- Add the three student-outcome indicators to the protected administrator report.
-- The report returns aggregates only; it never exposes student IDs or assignments.
begin;

alter table public.assignments
  add column grade_earned_percent numeric;

alter table public.assignments
  add constraint assignments_grade_earned_percent_range
  check (grade_earned_percent is null or grade_earned_percent between 0 and 100);

alter table public.app_daily_activity
  add column active_seconds integer not null default 0
  check (active_seconds between 0 and 86400);

grant select (grade_earned_percent), update (grade_earned_percent)
  on public.assignments to authenticated;

create or replace function public.record_app_usage(p_seconds integer) returns integer
language plpgsql security definer set search_path='' as $$
declare
  today date := (now() at time zone 'America/Denver')::date;
  total integer;
begin
  perform private.assert_browser_session();
  if p_seconds is null or p_seconds not between 1 and 120 then
    raise exception 'Usage update must be between 1 and 120 seconds';
  end if;

  insert into public.app_daily_activity(owner_id,activity_date,active_seconds)
  values(auth.uid(),today,p_seconds)
  on conflict(owner_id,activity_date) do update
    set last_opened_at=now(),
        active_seconds=least(86400,public.app_daily_activity.active_seconds+p_seconds)
  returning active_seconds into total;
  return total;
end $$;

create or replace function public.get_admin_okr_dashboard() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  today date := (now() at time zone 'America/Denver')::date;
  week_start date := today-6;
  active_start date := today-29;
  assignment_start timestamptz := active_start::timestamp at time zone 'America/Denver';
  active_count integer;
  daily_count integer;
  late_goal_users integer;
  late_assignments integer;
  grade_goal_users integer;
  grade_measured_users integer;
  usage_goal_users integer;
  usage_measured_users integer;
  usage_average_minutes numeric;
  trend jsonb;
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
    raise exception 'Administrator access required';
  end if;

  select count(distinct owner_id) into active_count
  from public.app_daily_activity
  where activity_date between active_start and today;

  select count(*) into daily_count
  from (
    select owner_id from public.app_daily_activity
    where activity_date between week_start and today
    group by owner_id having count(distinct activity_date)=7
  ) daily_users;

  with active_users as (
    select distinct owner_id from public.app_daily_activity
    where activity_date between active_start and today
  ), late_by_user as (
    select u.owner_id,count(a.assignment_id) filter (
      where a.completed and a.completed_at>=assignment_start
        and a.due_date is not null and a.completed_at>a.due_date
    )::integer late_count
    from active_users u
    left join public.assignments a on a.owner_id=u.owner_id
    group by u.owner_id
  )
  select count(*) filter (where late_count<=1),coalesce(sum(late_count),0)
  into late_goal_users,late_assignments from late_by_user;

  with active_users as (
    select distinct owner_id from public.app_daily_activity
    where activity_date between active_start and today
  ), grades_by_user as (
    select u.owner_id,
      count(a.assignment_id) filter (
        where a.completed and a.completed_at>=assignment_start
          and a.grade_earned_percent is not null and a.due_date is not null
      )::integer measured_count,
      count(a.assignment_id) filter (
        where a.completed and a.completed_at>=assignment_start
          and a.grade_earned_percent>=80 and a.due_date is not null
          and a.completed_at<=a.due_date
      )::integer successful_count
    from active_users u
    left join public.assignments a on a.owner_id=u.owner_id
    group by u.owner_id
  )
  select count(*) filter (where measured_count>0),
    count(*) filter (where measured_count>0 and 100.0*successful_count/measured_count>=90)
  into grade_measured_users,grade_goal_users from grades_by_user;

  with active_users as (
    select distinct owner_id from public.app_daily_activity
    where activity_date between active_start and today
  ), usage_by_user as (
    select u.owner_id,
      count(a.activity_date) filter (where a.active_seconds>0)::integer measured_days,
      coalesce(sum(a.active_seconds) filter (where a.active_seconds>0),0)::numeric /
        nullif(count(a.activity_date) filter (where a.active_seconds>0),0) average_seconds
    from active_users u
    left join public.app_daily_activity a on a.owner_id=u.owner_id
      and a.activity_date between week_start and today
    group by u.owner_id
  )
  select count(*) filter (where measured_days>0),
    count(*) filter (where measured_days>0 and average_seconds<1800),
    coalesce(round(avg(average_seconds) filter (where measured_days>0)/60.0,1),0)
  into usage_measured_users,usage_goal_users,usage_average_minutes from usage_by_user;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date',days.day::date,'users',coalesce(counts.users,0)
  ) order by days.day),'[]'::jsonb) into trend
  from generate_series(week_start,today,interval '1 day') days(day)
  left join (
    select activity_date,count(distinct owner_id) users
    from public.app_daily_activity
    where activity_date between week_start and today
    group by activity_date
  ) counts on counts.activity_date=days.day::date;

  return jsonb_build_object(
    'week_start',week_start,'week_end',today,'active_window_days',30,
    'active_users',active_count,'daily_trend',trend,
    'engagement',jsonb_build_object(
      'goal_percent',75,'current_percent',case when active_count=0 then 0 else round(100.0*daily_count/active_count,1) end,
      'qualifying_users',daily_count,'goal_met',active_count>0 and 100.0*daily_count/active_count>=75
    ),
    'late_work',jsonb_build_object(
      'goal_percent',80,'current_percent',case when active_count=0 then 0 else round(100.0*late_goal_users/active_count,1) end,
      'qualifying_users',late_goal_users,'late_assignments',late_assignments,'maximum_late_assignments',1,
      'window_days',30,'goal_met',active_count>0 and 100.0*late_goal_users/active_count>=80
    ),
    'on_time_b',jsonb_build_object(
      'goal_percent',70,'current_percent',case when active_count=0 then 0 else round(100.0*grade_goal_users/active_count,1) end,
      'qualifying_users',grade_goal_users,'measured_users',grade_measured_users,
      'assignment_success_percent',90,'minimum_grade_percent',80,'window_days',30,
      'goal_met',active_count>0 and 100.0*grade_goal_users/active_count>=70
    ),
    'under_30_minutes',jsonb_build_object(
      'goal_percent',50,'current_percent',case when active_count=0 then 0 else round(100.0*usage_goal_users/active_count,1) end,
      'qualifying_users',usage_goal_users,'measured_users',usage_measured_users,
      'average_minutes',usage_average_minutes,'daily_limit_minutes',30,'window_days',7,
      'goal_met',active_count>0 and 100.0*usage_goal_users/active_count>=50
    )
  );
end $$;

revoke all on function public.record_app_usage(integer),public.get_admin_okr_dashboard()
from public,anon,authenticated;
grant execute on function public.record_app_usage(integer),public.get_admin_okr_dashboard()
to authenticated;

commit;
notify pgrst, 'reload schema';
