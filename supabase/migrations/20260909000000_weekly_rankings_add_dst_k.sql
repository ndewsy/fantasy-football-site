-- Extend Weekly Rankings to cover DST and K, matching players.position values.
ALTER TABLE weekly_rankings DROP CONSTRAINT weekly_rankings_position_check;
ALTER TABLE weekly_rankings ADD CONSTRAINT weekly_rankings_position_check
  CHECK (position IN ('QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K'));
