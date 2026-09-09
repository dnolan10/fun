-- Run this in Supabase SQL Editor if you already ran the original schema.sql.
-- Adds AP Top 25 rank columns to games so both admin and users can see them.

alter table games add column if not exists home_rank int;
alter table games add column if not exists away_rank int;
