-- Buyer-to-merchant chat for BBen.
-- Access is restricted to the customer and the owner of the related store by RLS.

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists chat_conversations_customer_recent_idx
  on public.chat_conversations (customer_id, last_message_at desc);
create index if not exists chat_conversations_store_recent_idx
  on public.chat_conversations (store_id, last_message_at desc);
create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists chat_conversations_select_participant on public.chat_conversations;
create policy chat_conversations_select_participant
on public.chat_conversations for select to authenticated
using (
  customer_id = auth.uid()
  or exists (
    select 1 from public.stores s
    where s.id = chat_conversations.store_id and s.owner_id = auth.uid()
  )
);

drop policy if exists chat_conversations_insert_customer on public.chat_conversations;
create policy chat_conversations_insert_customer
on public.chat_conversations for insert to authenticated
with check (
  customer_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'customer')
  and exists (select 1 from public.stores s where s.id = chat_conversations.store_id and s.status = 'active')
  and (
    product_id is null
    or exists (
      select 1 from public.products p
      where p.id = chat_conversations.product_id
        and p.store_id = chat_conversations.store_id
        and p.status = 'active'
    )
  )
);

drop policy if exists chat_messages_select_participant on public.chat_messages;
create policy chat_messages_select_participant
on public.chat_messages for select to authenticated
using (
  exists (
    select 1 from public.chat_conversations c
    where c.id = chat_messages.conversation_id
      and (
        c.customer_id = auth.uid()
        or exists (select 1 from public.stores s where s.id = c.store_id and s.owner_id = auth.uid())
      )
  )
);

drop policy if exists chat_messages_insert_participant on public.chat_messages;
create policy chat_messages_insert_participant
on public.chat_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and char_length(btrim(body)) between 1 and 1000
  and exists (
    select 1
    from public.chat_conversations c
    join public.profiles p on p.id = auth.uid()
    where c.id = chat_messages.conversation_id
      and (
        (c.customer_id = auth.uid() and p.role = 'customer')
        or (
          p.role = 'merchant'
          and exists (select 1 from public.stores s where s.id = c.store_id and s.owner_id = auth.uid())
        )
      )
  )
);

create or replace function public.set_chat_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.chat_conversations
  set last_message_at = new.created_at,
      updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_update_conversation on public.chat_messages;
create trigger chat_messages_update_conversation
after insert on public.chat_messages
for each row execute function public.set_chat_conversation_last_message();

grant select, insert on public.chat_conversations to authenticated;
grant select, insert on public.chat_messages to authenticated;
