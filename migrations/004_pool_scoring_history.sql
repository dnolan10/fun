-- Run this in Supabase SQL Editor after 002 and 003.
-- Powers a "pts/gm within this pool" stat that is 100% accurate because it's
-- computed entirely from games your own pool has already scored -- no
-- external matching involved, so there's nothing to get wrong.

create or replace view team_game_scores as
select home_team as team, home_score as points
from games
where is_final
union all
select away_team as team, away_score as points
from games
where is_final;

create or replace view team_scoring_history as
select team, round(avg(points)::numeric, 1) as avg_points, count(*) as games_played
from team_game_scores
group by team;

grant select on team_game_scores, team_scoring_history to authenticated, anon;
