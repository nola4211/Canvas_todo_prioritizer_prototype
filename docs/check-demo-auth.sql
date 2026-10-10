-- UNAPPLIED read-only diagnostic for the exact shared synthetic demo account.
-- Run only in the existing canvas_prioritizer project's administrator SQL editor.
-- Does not retrieve passwords, password hashes, tokens, or other accounts.
select id,email,
  email_confirmed_at is not null as email_confirmed,
  coalesce(banned_until>now(),false) as currently_banned,
  last_sign_in_at
from auth.users
where id='a527cc80-a8d6-43d6-9a04-b62650a0d621'::uuid
  and lower(email)='test@user.com';
