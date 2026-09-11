-- ============================================================
-- Fix: scoring views counted picks from unpublished/draft weeks too
-- (e.g. an old abandoned week nobody else can even see), and the same
-- views bypassed Row-Level Security entirely since plain Postgres views
-- run with the view owner's privileges unless security_invoker is set --
-- meaning anyone with the public anon key could query them directly and
-- see every pick, including ones that haven't locked yet.
--
-- Run in Supabase: Dashboard > SQL Editor > New query
-- ============================================================

create or replace view game_ats_winner
with (security_invoker = true)
as
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

-- Points per pick (1 = correct against the spread, 0 = wrong or push).
-- Now scoped to published weeks only -- a pick made in a week that was
-- never (or no longer) published shouldn't count toward anyone's record.
create or replace view pick_results
with (security_invoker = true)
as
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
join game_ats_winner gw on gw.game_id = g.id
join weeks w on w.id = g.week_id
where w.is_published = true;

-- Points per user per week
create or replace view weekly_scores
with (security_invoker = true)
as
select user_id, week_id, sum(points) as points
from pick_results
where points is not null
group by user_id, week_id;

-- Cumulative points per user across all weeks
create or replace view cumulative_scores
with (security_invoker = true)
as
select user_id, sum(points) as total_points
from weekly_scores
group by user_id;
