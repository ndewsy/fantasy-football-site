ALTER TABLE players ADD COLUMN IF NOT EXISTS rookie_year integer;

CREATE TABLE IF NOT EXISTS player_week_stats (
  id bigserial PRIMARY KEY,
  player_id integer NOT NULL REFERENCES players(id),
  season integer NOT NULL,
  week integer NOT NULL,
  season_type text NOT NULL DEFAULT 'regular',
  position text,
  stats jsonb NOT NULL DEFAULT '{}',
  fantasy_points numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, season, week, season_type)
);

ALTER TABLE player_week_stats ENABLE ROW LEVEL SECURITY;
