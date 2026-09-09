-- Run this in Supabase SQL Editor.

create table if not exists feedback (
  id serial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  message text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

drop policy if exists "feedback insert own" on feedback;
create policy "feedback insert own" on feedback for insert with check (auth.uid() = user_id);

drop policy if exists "feedback select own or admin" on feedback;
create policy "feedback select own or admin" on feedback for select using (
  auth.uid() = user_id or is_admin()
);

drop policy if exists "feedback update admin" on feedback;
create policy "feedback update admin" on feedback for update using (is_admin()) with check (is_admin());

grant select, insert, update on feedback to authenticated;
