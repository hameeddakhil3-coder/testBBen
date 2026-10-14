-- Enable Supabase Realtime events for buyer/merchant chat.
-- Keep this migration idempotent for environments where a table was already added.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_messages'
    ) then
      execute 'alter publication supabase_realtime add table public.chat_messages';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_conversations'
    ) then
      execute 'alter publication supabase_realtime add table public.chat_conversations';
    end if;
  end if;
end
$$;
