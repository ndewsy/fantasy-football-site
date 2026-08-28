-- Auction-format rankings (% of budget per player) + a per-format written
-- "team build" strategy explanation, kept separate from the regular `rankings`
-- table since auction data doesn't fit that table's order/tier/movement model.
CREATE TABLE IF NOT EXISTS auction_rankings (
  id bigserial PRIMARY KEY,
  creator_id text NOT NULL,
  format text NOT NULL CHECK (format IN ('Auction 1QB', 'Auction SF')),
  -- Ordered array of { player_id, pct }. Array position = rank; pct is the
  -- creator's % of a $200 budget for that player (null = not yet set).
  players jsonb NOT NULL DEFAULT '[]',
  team_build_description text,
  locked boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, format)
);
