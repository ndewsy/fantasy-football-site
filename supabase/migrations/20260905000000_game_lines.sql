-- Game-level Vegas lines (Start/Sit tab): full-game point total and each
-- team's implied total, blended across the same tracked books as player
-- props. One row per upcoming game.
CREATE TABLE game_lines (
  id bigserial PRIMARY KEY,
  sgo_event_id text NOT NULL UNIQUE,
  home_team_id text NOT NULL,
  away_team_id text NOT NULL,
  game_total numeric,
  home_team_total numeric,
  away_team_total numeric,
  game_starts_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_lines ENABLE ROW LEVEL SECURITY;
