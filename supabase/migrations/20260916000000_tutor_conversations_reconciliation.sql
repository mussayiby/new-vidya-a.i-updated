create table if not exists public.tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.tutor_conversations(id) on delete cascade,
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(btrim(content)) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index if not exists tutor_conversations_user_updated_idx
  on public.tutor_conversations(user_id, updated_at desc);

create index if not exists tutor_messages_conversation_created_idx
  on public.tutor_messages(conversation_id, created_at);

alter table public.tutor_conversations enable row level security;
alter table public.tutor_messages enable row level security;

drop policy if exists "Users can read their tutor conversations"
  on public.tutor_conversations;
create policy "Users can read their tutor conversations"
  on public.tutor_conversations for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create their tutor conversations"
  on public.tutor_conversations;
create policy "Users can create their tutor conversations"
  on public.tutor_conversations for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their tutor conversations"
  on public.tutor_conversations;
create policy "Users can update their tutor conversations"
  on public.tutor_conversations for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their tutor conversations"
  on public.tutor_conversations;
create policy "Users can delete their tutor conversations"
  on public.tutor_conversations for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can read their tutor messages"
  on public.tutor_messages;
create policy "Users can read their tutor messages"
  on public.tutor_messages for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create their tutor messages"
  on public.tutor_messages;
create policy "Users can create their tutor messages"
  on public.tutor_messages for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.tutor_conversations
      where tutor_conversations.id = tutor_messages.conversation_id
        and tutor_conversations.user_id = auth.uid()
    )
  );

create or replace function public.touch_tutor_conversation_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.tutor_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists tutor_messages_touch_conversation
  on public.tutor_messages;
create trigger tutor_messages_touch_conversation
after insert on public.tutor_messages
for each row
execute function public.touch_tutor_conversation_updated_at();

create or replace function public.touch_tutor_conversation_updated_at_on_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tutor_conversations_updated_at
  on public.tutor_conversations;
create trigger tutor_conversations_updated_at
before update on public.tutor_conversations
for each row
execute function public.touch_tutor_conversation_updated_at_on_update();

grant select, insert, update, delete
  on public.tutor_conversations to authenticated;
grant select, insert
  on public.tutor_messages to authenticated;
grant all
  on public.tutor_conversations to service_role;
grant all
  on public.tutor_messages to service_role;
