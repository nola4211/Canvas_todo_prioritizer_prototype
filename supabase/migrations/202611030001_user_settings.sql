-- Applied to uowlwdwrqceklbqjcnmc on November 3, 2026. Do not rerun there.
-- For a fresh project, apply once after the earlier migrations. This creates no settings
-- for existing users; the app uses the same defaults until an account saves a preference.
begin;

-- One small row holds the ordinary Settings switches for each Auth account.
-- Priority rules stay in user_priorities because they have their own structure.
create table public.user_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  push_notifications boolean not null default true,
  sync_with_canvas boolean not null default true,
  dark_mode boolean not null default false
);

alter table public.user_settings enable row level security;
revoke all on public.user_settings from public, anon, authenticated;
grant select on public.user_settings to authenticated;
grant insert (push_notifications, sync_with_canvas, dark_mode),
  update (push_notifications, sync_with_canvas, dark_mode)
  on public.user_settings to authenticated;

create policy own_user_settings on public.user_settings for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

commit;
