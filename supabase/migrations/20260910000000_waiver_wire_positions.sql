-- Priority Adds and Streamers split into position tabs (QB/FLEX/TE/K/DST);
-- Drop/Cut stays a single flat list with no position, term, or FAAB.
ALTER TABLE waiver_wire_entries ADD COLUMN position text;
ALTER TABLE waiver_wire_entries ADD CONSTRAINT waiver_wire_entries_position_check
  CHECK (position IS NULL OR position IN ('QB', 'FLEX', 'TE', 'K', 'DST'));

-- Backfill existing priority/streamer rows from each player's real position
-- (RB/WR collapse into FLEX) so none of the already-posted picks go missing
-- once the UI starts filtering by position.
UPDATE waiver_wire_entries w
SET position = CASE p.position
  WHEN 'QB' THEN 'QB'
  WHEN 'RB' THEN 'FLEX'
  WHEN 'WR' THEN 'FLEX'
  WHEN 'TE' THEN 'TE'
  WHEN 'K' THEN 'K'
  WHEN 'DST' THEN 'DST'
  ELSE NULL
END
FROM players p
WHERE w.player_id = p.id AND w.category IN ('priority', 'streamer');

-- Drop/Cut no longer shows term/FAAB — clear any legacy values so nothing
-- stray renders once the client stops sending them.
UPDATE waiver_wire_entries SET term = NULL, faab_pct = NULL WHERE category = 'drop';
