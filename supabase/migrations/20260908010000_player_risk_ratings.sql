-- Risk rating becomes per-creator (each creator has their own opinion,
-- shown only on their own rankings tab) instead of one global players
-- column — the consensus tab now averages across whichever creators have
-- rated a player rather than storing a separate value.
CREATE TABLE player_risk_ratings (
  id bigserial PRIMARY KEY,
  creator_id text NOT NULL,
  player_id integer NOT NULL REFERENCES players(id),
  risk_rating smallint NOT NULL CHECK (risk_rating BETWEEN 1 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A row's existence = "this creator has rated this player" — clearing a
  -- rating deletes the row so it naturally drops out of the consensus average.
  UNIQUE (creator_id, player_id)
);

-- Server-side only (service-role key), same pattern as waiver_wire_entries/player_prop_lines.
ALTER TABLE public.player_risk_ratings ENABLE ROW LEVEL SECURITY;

ALTER TABLE players DROP COLUMN IF EXISTS risk_rating;
