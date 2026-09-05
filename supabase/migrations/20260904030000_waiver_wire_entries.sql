-- Waiver Wire (beta, creators only): per-creator, per-week picks across three
-- categories. Row-per-entry rather than one JSONB blob per creator+week
-- (like auction_rankings) because each category is its own independently
-- reorderable list with its own per-entry fields.
CREATE TABLE waiver_wire_entries (
  id bigserial PRIMARY KEY,
  creator_id text NOT NULL,
  week integer NOT NULL,
  category text NOT NULL CHECK (category IN ('drop', 'streamer', 'priority')),
  player_id integer NOT NULL REFERENCES players(id),
  term text CHECK (term IN ('short', 'long')),
  faab_pct numeric,
  rank integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- The same player can appear in more than one category the same week
  -- (e.g. a "priority add" that's also flagged as a streamer) — that's
  -- intentional, only exact duplicates within one category are blocked.
  UNIQUE (creator_id, week, category, player_id)
);

CREATE INDEX waiver_wire_entries_week_category_idx ON waiver_wire_entries (week, category);

-- Server-side only (service-role key), same pattern as player_prop_lines/auction_rankings.
ALTER TABLE public.waiver_wire_entries ENABLE ROW LEVEL SECURITY;
