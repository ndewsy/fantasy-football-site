import { createClient } from '@supabase/supabase-js';
import { normalizePlayerName } from '@/lib/normalizePlayerName';
import { fetchSgoEvents, buildRowsFromSgoEvents, upsertPropsRows } from '@/lib/propsSync';
import { fetchOddsApiRowsForTeam } from '@/lib/oddsApiFallback';
import { teamCodeToSgoId } from '@/lib/teamIds';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

async function findOpponentCode(team) {
  const { data, error } = await supabase()
    .from('season_games')
    .select('home_team, away_team, kickoff_at')
    .or(`home_team.eq.${team},away_team.eq.${team}`)
    .gt('kickoff_at', new Date().toISOString())
    .order('kickoff_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  const g = data?.[0];
  if (!g) return null;
  return g.home_team === team ? g.away_team : g.home_team;
}

async function buildByNormForTeams(teamCodes) {
  const { data, error } = await supabase()
    .from('players')
    .select('id, name, position, team')
    .in('team', teamCodes);
  if (error) throw error;
  const byNorm = new Map();
  for (const p of data || []) {
    const n = normalizePlayerName(p.name);
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(p);
  }
  return byNorm;
}

// Fetches and caches betting lines for one player's next game, the moment
// someone actually looks them up (Start/Sit Compare) — replaces the old
// bulk cron that pre-fetched every upcoming game's props on a schedule,
// which was burning through SportsGameOdds' monthly object quota (and,
// once that failed, The Odds API's credit budget too) fetching hundreds of
// players nobody was about to look at that week. Called from
// app/api/start-sit/compare/route.js before it reads player_prop_lines;
// a no-op if that player's next game is already cached.
export async function ensurePlayerPropsFresh(player) {
  if (!player?.team) return { fetched: false, reason: 'no-team' };

  const { data: existing, error: existingError } = await supabase()
    .from('player_prop_lines')
    .select('id')
    .eq('player_id', player.id)
    .gt('game_starts_at', new Date().toISOString())
    .limit(1);
  if (existingError) throw existingError;
  if (existing && existing.length > 0) return { fetched: false, reason: 'cached' };

  // Known from our own schedule (free) rather than from whichever provider
  // answers first — lets both the SGO and Odds API paths below build a
  // byNorm covering both rosters, so an opponent's players in the same game
  // get cached correctly too instead of landing in player_prop_unmatched.
  const opponentCode = await findOpponentCode(player.team);
  if (!opponentCode) return { fetched: false, reason: 'no-upcoming-game' };
  const byNorm = await buildByNormForTeams([player.team, opponentCode]);

  const sgoTeamId = teamCodeToSgoId(player.team);
  let sgoEvents = null;
  let sgoError = null;
  if (sgoTeamId && process.env.SPORTSGAMEODDS_API_KEY) {
    try {
      sgoEvents = await fetchSgoEvents({ teamID: sgoTeamId });
    } catch (err) {
      sgoError = err;
      console.error(`[ensurePlayerProps] SGO fetch failed for ${player.team}:`, err.message);
    }
  }

  if (sgoEvents && sgoEvents.length > 0) {
    const rows = buildRowsFromSgoEvents(sgoEvents, byNorm);
    await upsertPropsRows(supabase(), rows);
    return { fetched: true, source: 'sgo', ...rows };
  }

  // SGO failed, isn't configured, or had nothing upcoming for this team —
  // fall back to The Odds API, scoped to just this one game.
  if (!process.env.ODDS_API_KEY) {
    if (sgoError) throw sgoError;
    return { fetched: false, reason: 'no-provider-available' };
  }
  try {
    const fallback = await fetchOddsApiRowsForTeam(player.team, byNorm);
    if (!fallback.found) return { fetched: false, reason: 'no-upcoming-game' };
    await upsertPropsRows(supabase(), fallback);
    return { fetched: true, source: 'odds_api', ...fallback };
  } catch (fallbackErr) {
    console.error(`[ensurePlayerProps] Odds API fallback failed for ${player.team}:`, fallbackErr.message);
    throw sgoError || fallbackErr;
  }
}
