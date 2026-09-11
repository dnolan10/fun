-- ============================================================
-- Avatars + pick-progress tracking
-- Run in Supabase: Dashboard > SQL Editor > New query
-- ============================================================

-- ---------- AVATARS ----------
alter table profiles add column if not exists avatar_type text not null default 'initial'
  check (avatar_type in ('initial', 'emoji', 'photo'));
alter table profiles add column if not exists avatar_emoji text;
alter table profiles add column if not exists avatar_color text;
alter table profiles add column if not exists avatar_url text;

-- Storage bucket for uploaded profile photos. Public read so <img> tags can
-- load them directly; writes are restricted to the owner's own folder below.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar images public read" on storage.objects;
create policy "avatar images public read" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatar upload own folder" on storage.objects;
create policy "avatar upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar update own folder" on storage.objects;
create policy "avatar update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar delete own folder" on storage.objects;
create policy "avatar delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- PICK PROGRESS (for lock-deadline reminders) ----------
-- Exposes ONLY whether each person has finished picking a given week -- never
-- the actual picks themselves. Needs security definer because the "picks"
-- RLS policy hides other people's rows for games that haven't locked yet,
-- which is exactly what we still want for the picks themselves.
create or replace function week_pick_completion(p_week_id int)
returns table (
  user_id uuid,
  display_name text,
  total_games int,
  picks_made int,
  is_complete boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.id as user_id,
    pr.display_name,
    (select count(*) from games g where g.week_id = p_week_id) as total_games,
    coalesce(pk.picks_made, 0) as picks_made,
    coalesce(pk.picks_made, 0) >= (select count(*) from games g where g.week_id = p_week_id)
      as is_complete
  from profiles pr
  left join (
    select p.user_id, count(*) as picks_made
    from picks p
    join games g on g.id = p.game_id
    where g.week_id = p_week_id
    group by p.user_id
  ) pk on pk.user_id = pr.id;
$$;

grant execute on function week_pick_completion(int) to authenticated;
