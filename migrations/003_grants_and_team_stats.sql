-- Run this in Supabase SQL Editor.

-- 1) Defensive fix for "picks don't seem to save": explicitly grant table
-- privileges to the authenticated/anon roles. Row Level Security policies
-- only ever narrow down which ROWS a role can touch -- the role still needs
-- the base privilege to touch the table at all. Tables created through the
-- SQL Editor don't always pick this up automatically.
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on public.profiles, public.weeks, public.games, public.picks to authenticated;
grant select on public.profiles, public.weeks, public.games, public.picks to anon;
grant select on public.game_ats_winner, public.pick_results, public.weekly_scores, public.cumulative_scores to authenticated, anon;

-- 2) Team stat columns for the "record" / "avg points per game" display
alter table games add column if not exists home_record text;
alter table games add column if not exists away_record text;
alter table games add column if not exists home_ppg numeric;
alter table games add column if not exists away_ppg numeric;
