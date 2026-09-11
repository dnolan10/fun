-- ============================================================
-- Restrict self-service profile updates to just the columns a user
-- should be able to change themselves (display name + avatar).
--
-- Previously "grant update on profiles to authenticated" combined with an
-- RLS policy that only checked auth.uid() = id (no column restriction)
-- meant any signed-in user could update ANY column on their own row via a
-- direct API call from the browser console -- including is_admin. Column-
-- level grants close that off at the database level, regardless of what
-- the app's UI exposes.
--
-- Run in Supabase: Dashboard > SQL Editor > New query
-- ============================================================

revoke update on profiles from authenticated;
grant update (display_name, avatar_type, avatar_emoji, avatar_color, avatar_url)
  on profiles to authenticated;

-- Keep display names reasonable and never blank.
alter table profiles drop constraint if exists display_name_length;
alter table profiles add constraint display_name_length
  check (char_length(trim(display_name)) between 1 and 30);
