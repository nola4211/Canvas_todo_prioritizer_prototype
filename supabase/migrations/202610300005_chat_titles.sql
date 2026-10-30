-- Give each chat a short title from its first student message.
begin;

create or replace function public.ai_chat_summary(p_message text) returns text
language sql immutable set search_path='' as $$
  select left(coalesce(nullif(string_agg(word,' ' order by position),''),'New chat'),100)
  from (
    select word,position
    from regexp_split_to_table(
      regexp_replace(btrim(coalesce(p_message,'')),'[^[:alnum:]%]+',' ','g'),
      '\s+'
    ) with ordinality as parts(word,position)
    where word<>''
    order by position
    limit 5
  ) first_words;
$$;

create or replace function public.name_ai_chat(p_chat_id bigint,p_message text) returns text
language plpgsql security definer set search_path='' as $$
declare saved_title text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_message is null or char_length(btrim(p_message)) not between 1 and 2000 then
    raise exception 'Use a message between 1 and 2000 characters';
  end if;

  update public.chat
    set title=public.ai_chat_summary(p_message)
    where "chat_ID"=p_chat_id
      and owner_id=auth.uid()
      and (title='New chat' or title like 'Conversation %')
    returning title into saved_title;

  if saved_title is null then
    select title into saved_title from public.chat
      where "chat_ID"=p_chat_id and owner_id=auth.uid();
  end if;
  if saved_title is null then raise exception 'Conversation unavailable'; end if;
  return saved_title;
end $$;

-- Improve the names of chats that already have a first student message.
with first_messages as (
  select distinct on ("chat_ID") "chat_ID",message
  from public.message
  where role='user'
  order by "chat_ID","message_ID"
)
update public.chat c
set title=public.ai_chat_summary(f.message)
from first_messages f
where c."chat_ID"=f."chat_ID";

revoke all on function public.ai_chat_summary(text),public.name_ai_chat(bigint,text) from public,anon,authenticated;
grant execute on function public.name_ai_chat(bigint,text) to authenticated;

commit;
