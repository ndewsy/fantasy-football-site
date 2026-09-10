-- Weekly Rankings no longer has a combined FLEX bucket — full QB/RB/WR/TE/DST/K split.
-- No existing rows use FLEX (verified before this migration), so no backfill needed.
ALTER TABLE weekly_rankings DROP CONSTRAINT weekly_rankings_position_check;
ALTER TABLE weekly_rankings ADD CONSTRAINT weekly_rankings_position_check
  CHECK (position IN ('QB', 'RB', 'WR', 'TE', 'DST', 'K'));
