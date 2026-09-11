-- ============================================================
-- Trash Talk — a live group chat for the pool
-- Run in Supabase: Dashboard > SQL Editor > New query
-- ============================================================

create table if not exists trash_talk (
  id serial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table trash_talk enable row level security;

drop policy if exists "trash talk select all" on trash_talk;
create policy "trash talk select all" on trash_talk for select using (true);

drop policy if exists "trash talk insert own" on trash_talk;
create policy "trash talk insert own" on trash_talk for insert with check (auth.uid() = user_id);

drop policy if exists "trash talk delete own or admin" on trash_talk;
create policy "trash talk delete own or admin" on trash_talk for delete using (
  auth.uid() = user_id or is_admin()
);

grant select, insert, delete on trash_talk to authenticated;
grant usage, select on sequence trash_talk_id_seq to authenticated;

-- Live updates: lets everyone's feed update instantly without refreshing.
alter publication supabase_realtime add table trash_talk;
