-- Rest-of-Season Rankings — a position-split ranked list per creator,
-- mirroring weekly_rankings but with no week dimension: a single,
-- continuously-updated list per creator+position for the rest of the
-- season. Replaces the archived Redraft/Dynasty rankings on the public
-- site (those tables/data are left untouched, just hidden from public
-- pages, so they can come back at season's end).
CREATE TABLE ros_rankings (
  id bigserial PRIMARY KEY,
  creator_id text NOT NULL,
  position text NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE')),
  player_id integer NOT NULL REFERENCES players(id),
  rank integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, position, player_id)
);

ALTER TABLE public.ros_rankings ENABLE ROW LEVEL SECURITY;

-- Per creator/position tier break points, mirroring weekly_ranking_tiers.
CREATE TABLE ros_ranking_tiers (
  creator_id text NOT NULL,
  position text NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE')),
  tiers jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (creator_id, position)
);

ALTER TABLE public.ros_ranking_tiers ENABLE ROW LEVEL SECURITY;

-- Free-text disclaimer, mirroring weekly_rankings_notes but creator-level
-- (not per-week, since ROS has no week).
CREATE TABLE ros_rankings_notes (
  creator_id text PRIMARY KEY,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ros_rankings_notes ENABLE ROW LEVEL SECURITY;
