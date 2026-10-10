-- APPLIED successfully after Cameron's explicit approval; recorded for review.
-- Historical one-time operation. Do not rerun: the guard rejects an already confirmed account.
-- Administrator confirmation for the shared synthetic demo account only.
-- Allows this account to sign in without following an emailed verification link.
-- Keeps the existing Auth UUID so the reviewed assignment policies still match.
begin;
do $confirm$
declare affected integer;
begin
  update auth.users
    set email_confirmed_at=now(),updated_at=now()
    where id='a527cc80-a8d6-43d6-9a04-b62650a0d621'::uuid
      and lower(email)='test@user.com'
      and email_confirmed_at is null;
  get diagnostics affected=row_count;
  if affected<>1 then
    raise exception 'Expected unconfirmed demo account changed; no change applied.';
  end if;
end $confirm$;
commit;
select id,email,email_confirmed_at is not null as email_confirmed
from auth.users
where id='a527cc80-a8d6-43d6-9a04-b62650a0d621'::uuid
  and lower(email)='test@user.com';
