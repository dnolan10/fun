-- ============================================================
-- Prevent the same real-world game from ever being added twice
-- (it happened: 6 games got added to both Week 4 and Week 5).
--
-- IMPORTANT: if you still have duplicates in your `games` table, this
-- migration will fail with "could not create unique index" until they're
-- resolved. Find them first with:
--
--   select external_id, array_agg(id) as game_ids, array_agg(week_id) as week_ids
--   from games
--   where external_id is not null
--   group by external_id
--   having count(*) > 1;
--
-- For each duplicate, check in Admin whether either copy already has picks
-- (the "X picks made" label next to each game) before deleting one --
-- deleting a game also deletes any picks already made on that specific
-- row. Once resolved, run this migration.
--
-- Run in Supabase: Dashboard > SQL Editor > New query
-- ============================================================

alter table games drop constraint if exists games_external_id_unique;
alter table games add constraint games_external_id_unique unique (external_id);
