-- Vegas player prop lines (Start/Sit tab), sourced from SportsGameOdds and refreshed
-- daily by app/api/cron/sync-player-props. One row per (player, game, stat).
CREATE TABLE IF NOT EXISTS player_prop_lines (
  id bigserial PRIMARY KEY,
  player_id integer NOT NULL REFERENCES players(id),
  sgo_player_id text NOT NULL,
  sgo_event_id text NOT NULL,
  stat_id text NOT NULL,
  line numeric NOT NULL,
  over_odds text,
  under_odds text,
  team_id text,
  opponent_id text,
  home_away text,
  game_starts_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, sgo_event_id, stat_id)
);

CREATE INDEX IF NOT EXISTS player_prop_lines_game_starts_at_idx ON player_prop_lines (game_starts_at);
CREATE INDEX IF NOT EXISTS player_prop_lines_player_id_idx ON player_prop_lines (player_id);

-- Names in prop feeds don't always resolve to a players-table row (rookies not yet
-- synced, name mismatches). Log unmatched names for review instead of silently
-- dropping their odds data.
CREATE TABLE IF NOT EXISTS player_prop_unmatched (
  id bigserial PRIMARY KEY,
  sgo_player_id text NOT NULL,
  sgo_event_id text NOT NULL,
  stat_id text NOT NULL,
  line numeric NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sgo_player_id, sgo_event_id, stat_id)
);
