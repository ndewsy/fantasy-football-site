-- Weekly Rankings (Huddle only, for now) — a position-split ranked list per
-- creator per week. "Archiving" the previous week is purely a display
-- concept (see lib/currentWeek.js's getCurrentWeekFromGames): every week's
-- rows stay in this table forever, browsable via a week selector, no
-- scheduled job or lock/unlock step needed.
CREATE TABLE weekly_rankings (
  id bigserial PRIMARY KEY,
  creator_id text NOT NULL,
  week integer NOT NULL,
  position text NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE', 'FLEX')),
  player_id integer NOT NULL REFERENCES players(id),
  rank integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, week, position, player_id)
);

-- Server-side only (service-role key), same pattern as waiver_wire_entries.
ALTER TABLE public.weekly_rankings ENABLE ROW LEVEL SECURITY;
