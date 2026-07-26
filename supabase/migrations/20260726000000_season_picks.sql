-- ── season_games ────────────────────────────────────────────────────────────
CREATE TABLE season_games (
  id           integer     PRIMARY KEY,
  week         smallint    NOT NULL,
  away_team    text        NOT NULL,
  home_team    text        NOT NULL,
  kickoff_at   timestamptz,
  espn_event_id text       UNIQUE,
  home_score   smallint,
  away_score   smallint,
  status       text        NOT NULL DEFAULT 'scheduled'
                           CHECK (status IN ('scheduled', 'in_progress', 'final')),
  winner       text        CHECK (winner IN ('home', 'away'))
);

-- ── season_picks ─────────────────────────────────────────────────────────────
CREATE TABLE season_picks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id    integer     NOT NULL REFERENCES season_games(id) ON DELETE CASCADE,
  pick       text        NOT NULL CHECK (pick IN ('home', 'away')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_id)
);

-- ── Lock trigger ─────────────────────────────────────────────────────────────
-- Rejects any INSERT or UPDATE on season_picks once the first game of week 1
-- has kicked off. This fires at the database level regardless of the API layer.
CREATE OR REPLACE FUNCTION enforce_picks_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  season_start timestamptz;
BEGIN
  SELECT MIN(kickoff_at) INTO season_start
  FROM season_games
  WHERE week = 1 AND kickoff_at IS NOT NULL;

  IF season_start IS NOT NULL AND now() >= season_start THEN
    RAISE EXCEPTION 'Picks are locked — the season has started';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER picks_lock_trigger
  BEFORE INSERT OR UPDATE ON season_picks
  FOR EACH ROW EXECUTE FUNCTION enforce_picks_lock();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE season_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_picks ENABLE ROW LEVEL SECURITY;

-- Games: anyone can read (public scoreboard)
CREATE POLICY "season_games_public_read" ON season_games
  FOR SELECT USING (true);

-- Picks: users see only their own rows
CREATE POLICY "season_picks_own_select" ON season_picks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "season_picks_own_insert" ON season_picks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "season_picks_own_update" ON season_picks
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role (used by the sync cron) bypasses RLS automatically.
