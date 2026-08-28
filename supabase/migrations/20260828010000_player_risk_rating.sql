-- Manually-set 1 (safe/green) to 10 (risky/red) rating shown on player cards.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS risk_rating smallint
    CHECK (risk_rating BETWEEN 1 AND 10);
