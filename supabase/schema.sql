-- ============================================================
-- Pick 'Em League — Supabase schema
-- Run this once in Supabase: Dashboard > SQL Editor > New query
-- ============================================================

-- ---------- PROFILES ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever someone signs up
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, is_admin)
  values (new.id, new.email, split_part(new.email, '@', 1), false);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper: is the current user an admin?
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;

-- ---------- WEEKS ----------
create table if not exists weeks (
  id serial primary key,
  season int not null,
  week_number int not null,
  label text not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (season, week_number)
);

-- ---------- GAMES ----------
create table if not exists games (
  id serial primary key,
  week_id int not null references weeks(id) on delete cascade,
  home_team text not null,
  away_team text not null,
  -- spread is relative to the HOME team: -6.5 means home favored by 6.5
  spread numeric not null default 0,
  kickoff_time timestamptz not null,
  is_tiebreaker boolean not null default false,
  home_score int,
  away_score int,
  is_final boolean not null default false,
  external_id text,
  -- AP Top 25 rank at the time the game was added, null if unranked
  home_rank int,
  away_rank int,
  -- Team record and season scoring average at the time the game was added
  home_record text,
  away_record text,
  home_ppg numeric,
  away_ppg numeric,
  created_at timestamptz not null default now()
);

-- Only one tiebreaker game per week
create unique index if not exists one_tiebreaker_per_week
  on games (week_id) where (is_tiebreaker = true);

-- ---------- PICKS ----------
create table if not exists picks (
  id serial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  game_id int not null references games(id) on delete cascade,
  picked_team text not null check (picked_team in ('home', 'away')),
  tiebreaker_guess int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_id)
);

-- ---------- SCORING VIEWS ----------
-- ATS winner per game, null until final
create or replace view game_ats_winner as
select
  g.id as game_id,
  g.week_id,
  g.is_tiebreaker,
  case
    when not g.is_final then null
    when (g.home_score - g.away_score + g.spread) > 0 then 'home'
    when (g.home_score - g.away_score + g.spread) < 0 then 'away'
    else 'push'
  end as ats_winner,
  (g.home_score + g.away_score) as actual_total
from games g;

-- Points per pick (1 = correct against the spread, 0 = wrong or push)
create or replace view pick_results as
select
  p.id as pick_id,
  p.user_id,
  p.game_id,
  g.week_id,
  p.picked_team,
  p.tiebreaker_guess,
  g.is_tiebreaker,
  gw.ats_winner,
  gw.actual_total,
  case
    when gw.ats_winner is null then null
    when gw.ats_winner = 'push' then 0
    when gw.ats_winner = p.picked_team then 1
    else 0
  end as points
from picks p
join games g on g.id = p.game_id
join game_ats_winner gw on gw.game_id = g.id;

-- Points per user per week
create or replace view weekly_scores as
select user_id, week_id, sum(points) as points
from pick_results
where points is not null
group by user_id, week_id;

-- Cumulative points per user across all weeks
create or replace view cumulative_scores as
select user_id, sum(points) as total_points
from weekly_scores
group by user_id;

-- ---------- ROW LEVEL SECURITY ----------
alter table profiles enable row level security;
alter table weeks enable row level security;
alter table games enable row level security;
alter table picks enable row level security;

-- Profiles: everyone can read (needed for leaderboard names), users can edit only their own display_name
drop policy if exists "profiles select all" on profiles;
create policy "profiles select all" on profiles for select using (true);

drop policy if exists "profiles update own" on profiles;
create policy "profiles update own" on profiles for update using (auth.uid() = id);

-- Weeks: published weeks visible to everyone; admins see and manage all
drop policy if exists "weeks select" on weeks;
create policy "weeks select" on weeks for select using (is_published = true or is_admin());

drop policy if exists "weeks admin write" on weeks;
create policy "weeks admin write" on weeks for all using (is_admin()) with check (is_admin());

-- Games: visible if the parent week is visible; only admins write
drop policy if exists "games select" on games;
create policy "games select" on games for select using (
  exists (select 1 from weeks w where w.id = games.week_id and (w.is_published or is_admin()))
);

drop policy if exists "games admin write" on games;
create policy "games admin write" on games for all using (is_admin()) with check (is_admin());

-- Picks: a user can always see their own pick; others' picks become visible once the game is locked (kickoff passed) or final
drop policy if exists "picks select" on picks;
create policy "picks select" on picks for select using (
  auth.uid() = user_id
  or exists (
    select 1 from games g where g.id = picks.game_id and (g.kickoff_time <= now() or g.is_final)
  )
);

-- Insert/update only your own pick, and only before kickoff
drop policy if exists "picks insert own before lock" on picks;
create policy "picks insert own before lock" on picks for insert with check (
  auth.uid() = user_id
  and exists (select 1 from games g where g.id = picks.game_id and g.kickoff_time > now())
);

drop policy if exists "picks update own before lock" on picks;
create policy "picks update own before lock" on picks for update using (
  auth.uid() = user_id
  and exists (select 1 from games g where g.id = picks.game_id and g.kickoff_time > now())
);

-- Admins can do anything to picks too (e.g. cleanup)
drop policy if exists "picks admin all" on picks;
create policy "picks admin all" on picks for all using (is_admin()) with check (is_admin());

-- ---------- EXPLICIT GRANTS ----------
-- RLS policies above only narrow down which ROWS a role can see/touch; the
-- role still needs the base table privilege. Grant those explicitly so this
-- works even in Postgres setups that don't inherit default privileges.
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on profiles, weeks, games, picks to authenticated;
grant select on profiles, weeks, games, picks to anon;
grant select on game_ats_winner, pick_results, weekly_scores, cumulative_scores to authenticated, anon;
