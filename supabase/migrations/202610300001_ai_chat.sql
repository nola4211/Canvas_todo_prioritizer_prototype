-- Apply once after inspecting chat/message. These tables were empty when inspected.
begin;
do $$ begin
  if exists(select 1 from public.chat) or exists(select 1 from public.message) then
    raise exception 'Chat tables contain data. Review ownership before applying this migration.';
  end if;
end $$;
alter table public.chat
  add column owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  add column title text not null default 'New conversation' check(char_length(btrim(title)) between 1 and 100),
  add column updated_at timestamptz not null default now(),
  add column active_request uuid,
  add column locked_until timestamptz;
alter table public.message
  alter column "chat_ID" set not null,
  alter column message set not null,
  add column role text not null check(role in ('user','assistant')),
  add column request_id uuid not null,
  add column status text not null default 'complete' check(status in ('pending','complete','failed')),
  add column attempts integer not null default 1 check(attempts between 1 and 3),
  add column model text,
  add constraint chat_message_length check(char_length(message) between 1 and 6000),
  add constraint unique_chat_request_role unique("chat_ID",request_id,role);
create index chat_owner_updated on public.chat(owner_id,updated_at desc);
create index message_chat_order on public.message("chat_ID","message_ID");
alter table public.chat enable row level security;
alter table public.message enable row level security;
revoke all on public.chat,public.message from public,anon,authenticated;
grant select on public.chat,public.message to authenticated;
grant all on public.chat,public.message to service_role;
create policy read_own_chats on public.chat for select to authenticated using(owner_id=(select auth.uid()));
create policy read_own_messages on public.message for select to authenticated
 using(exists(select 1 from public.chat c where c."chat_ID"=message."chat_ID" and c.owner_id=(select auth.uid())));

-- The browser cannot forge assistant replies or set the owner of a conversation.
create function public.create_ai_chat(p_title text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare new_chat public.chat;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  if (select count(*) from public.chat where owner_id=auth.uid())>=50 then raise exception 'Conversation limit reached (50)'; end if;
  insert into public.chat(title) values(left(coalesce(nullif(btrim(p_title),''),'New conversation'),100)) returning * into new_chat;
  return jsonb_build_object('id',new_chat."chat_ID"::text,'title',new_chat.title,'created_at',new_chat.created_at,'updated_at',new_chat.updated_at);
end $$;

-- Reserve one turn. Locks are brief database transactions, not a connection held open during AI work.
create function public.begin_ai_turn(p_chat_id bigint,p_request_id uuid,p_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.chat; old_message public.message; cached_reply text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_text is null or char_length(btrim(p_text)) not between 1 and 2000 or p_request_id is null then raise exception 'Use a message between 1 and 2000 characters'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select * into c from public.chat where "chat_ID"=p_chat_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Conversation unavailable'; end if;
  select * into old_message from public.message where "chat_ID"=p_chat_id and request_id=p_request_id and role='user';
  if found then
    if old_message.message<>btrim(p_text) then raise exception 'Request ID already used for another message'; end if;
    if old_message.status='complete' then
      select message into cached_reply from public.message where "chat_ID"=p_chat_id and request_id=p_request_id and role='assistant';
      return jsonb_build_object('cached',true,'reply',cached_reply);
    end if;
    if old_message.attempts>=3 then raise exception 'Retry limit reached; start a new message'; end if;
  end if;
  if c.locked_until>now() then raise exception 'A reply is already being generated. Please wait.'; end if;
  -- Count attempts across all chats, including retries. Older retries may conservatively count previous attempts too.
  if (select coalesce(sum(m.attempts),0) from public.message m join public.chat h on h."chat_ID"=m."chat_ID" where h.owner_id=auth.uid() and m.role='user' and m.sent_at>now()-interval '1 hour')>=30 then
    raise exception 'Hourly message limit reached. Try again later.';
  end if;
  insert into public.message("chat_ID",message,role,request_id,status)
    values(p_chat_id,btrim(p_text),'user',p_request_id,'pending')
    on conflict("chat_ID",request_id,role) do update set status='pending',attempts=public.message.attempts+1,sent_at=now();
  update public.chat set active_request=p_request_id,locked_until=now()+interval '90 seconds',updated_at=now() where "chat_ID"=p_chat_id;
  return jsonb_build_object('cached',false);
end $$;

-- Only the server may finalize a reply. Saving both statuses is atomic.
create function public.finish_ai_turn(p_owner uuid,p_chat_id bigint,p_request_id uuid,p_reply text,p_model text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.chat;
begin
  select * into c from public.chat where "chat_ID"=p_chat_id and owner_id=p_owner for update;
  if not found or c.active_request is distinct from p_request_id then raise exception 'Reply no longer matches the active request'; end if;
  if p_reply is not null then
    insert into public.message("chat_ID",message,role,request_id,status,model) values(p_chat_id,p_reply,'assistant',p_request_id,'complete',p_model);
  end if;
  update public.message set status=case when p_reply is null then 'failed' else 'complete' end where "chat_ID"=p_chat_id and request_id=p_request_id and role='user';
  update public.chat set active_request=null,locked_until=null,updated_at=now() where "chat_ID"=p_chat_id;
end $$;
revoke all on function public.create_ai_chat(text),public.begin_ai_turn(bigint,uuid,text),public.finish_ai_turn(uuid,bigint,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_ai_chat(text),public.begin_ai_turn(bigint,uuid,text) to authenticated;
grant execute on function public.finish_ai_turn(uuid,bigint,uuid,text,text) to service_role;
commit;
