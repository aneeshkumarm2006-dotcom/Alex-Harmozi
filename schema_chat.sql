-- Persistent chat history -- run once in the Supabase SQL editor.
-- Stores each user's conversations + messages, protected by RLS so a user can
-- only ever see their own. Requires Supabase Auth (auth.users).

create table if not exists conversations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id text not null default 'alex',
  title        text not null default 'New chat',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists conversations_user_idx
  on conversations (user_id, updated_at desc);

create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  tier            text,
  sources         jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conv_idx
  on messages (conversation_id, created_at);

-- Row-level security: each row is private to its owner.
alter table conversations enable row level security;
alter table messages enable row level security;

drop policy if exists "own conversations" on conversations;
create policy "own conversations" on conversations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own messages" on messages;
create policy "own messages" on messages
  for all
  using (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id and c.user_id = auth.uid()))
  with check (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id and c.user_id = auth.uid()));
