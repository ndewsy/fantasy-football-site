-- Real season stats + computed PPR fantasy points/positional finish, shown on
-- player cards as "previous season" reference stats.
CREATE TABLE IF NOT EXISTS player_season_stats (
  id bigserial PRIMARY KEY,
  player_id integer NOT NULL REFERENCES players(id),
  season integer NOT NULL,
  season_type text NOT NULL DEFAULT 'regular',
  position text,
  games_played integer,
  stats jsonb NOT NULL DEFAULT '{}',
  fantasy_points numeric,
  fantasy_finish integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, season, season_type)
);

CREATE INDEX IF NOT EXISTS player_season_stats_player_idx ON player_season_stats (player_id);
