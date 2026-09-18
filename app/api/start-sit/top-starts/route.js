import { createClient } from '@supabase/supabase-js';
import { computeProjection, buildProjectionLines, SCORING_FORMATS } from '@/lib/fantasyProjection';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// The season currently in progress — bump this once the 2027 season starts.
// Matches the constant in app/api/start-sit/compare/route.js.
const CURRENT_SEASON = 2026;

const TOP_N = 5;
const MAX_LIMIT = 50;
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const PAGE = 1000;

async function fetchAllRows(table, selectCols, applyFilters) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase().from(table).select(selectCols).range(from, from + PAGE - 1);
    if (applyFilters) query = applyFilters(query);
    const { data, error } = await query;
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

// A public, no-login "best plays this week" teaser — unlike /compare, this
// isn't gated by auth or vouchers since it's a passive leaderboard rather
// than a specific 2-player lookup. Computes fresh from current prop lines
// each request rather than being cached/stored, so it's never stale.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const scoring = SCORING_FORMATS.includes(searchParams.get('scoring')) ? searchParams.get('scoring') : 'ppr';
  const position = POSITIONS.includes(searchParams.get('position')) ? searchParams.get('position') : null;
  const parsedLimit = parseInt(searchParams.get('limit'), 10);
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_LIMIT) : TOP_N;

  try {
    // Ordered player_id, then game_starts_at — grouping by player_id below
    // naturally preserves each player's lines in chronological order, same
    // as /compare's "next event" selection.
    const allLines = await fetchAllRows('player_prop_lines', '*', (q) =>
      q.gt('game_starts_at', new Date().toISOString()).order('player_id').order('game_starts_at', { ascending: true })
    );
    if (allLines.length === 0) {
      return Response.json({ scoring, topStarts: [] });
    }

    const linesByPlayer = new Map();
    for (const line of allLines) {
      if (!linesByPlayer.has(line.player_id)) linesByPlayer.set(line.player_id, []);
      linesByPlayer.get(line.player_id).push(line);
    }
    const playerIds = [...linesByPlayer.keys()];

    const [players, seasonStatsRows, gameLines] = await Promise.all([
      fetchAllRows('players', 'id, name, position, team, espn_id, sleeper_id, rookie_year', (q) => {
        const withIds = q.in('id', playerIds);
        return position ? withIds.eq('position', position) : withIds;
      }),
      fetchAllRows('player_season_stats', 'player_id, games_played, stats, season', (q) => q.in('player_id', playerIds).order('season', { ascending: false })),
      fetchAllRows('game_lines', '*', (q) => q.in('sgo_event_id', [...new Set(allLines.map((l) => l.sgo_event_id))])),
    ]);

    const seasonStatsByPlayer = new Map();
    for (const row of seasonStatsRows) {
      if (!seasonStatsByPlayer.has(row.player_id)) seasonStatsByPlayer.set(row.player_id, row);
    }
    const gameLineByEvent = new Map(gameLines.map((g) => [g.sgo_event_id, g]));

    const projected = [];
    for (const player of players) {
      const playerLines = linesByPlayer.get(player.id);
      if (!playerLines || playerLines.length === 0) continue;

      const nextEventId = playerLines[0].sgo_event_id;
      const nextLines = playerLines.filter((l) => l.sgo_event_id === nextEventId);
      const seasonStats = seasonStatsByPlayer.get(player.id) || null;
      const isRookie = player.rookie_year === CURRENT_SEASON;

      const { lines: projectionLines, marketCompleteness } = buildProjectionLines(player.position, nextLines, seasonStats, isRookie);
      const projection = computeProjection(projectionLines, scoring);
      const homeAway = nextLines[0].home_away;
      const gameLine = gameLineByEvent.get(nextEventId) || null;

      projected.push({
        player: { id: player.id, name: player.name, position: player.position, team: player.team, espn_id: player.espn_id, sleeper_id: player.sleeper_id },
        gameStartsAt: nextLines[0].game_starts_at,
        opponentId: nextLines[0].opponent_id,
        homeAway,
        projectedPoints: projection.total,
        marketCompleteness,
        teamImpliedTotal: gameLine ? (homeAway === 'home' ? gameLine.home_team_total : gameLine.away_team_total) : null,
      });
    }

    projected.sort((a, b) => b.projectedPoints - a.projectedPoints);

    return Response.json({ scoring, topStarts: projected.slice(0, limit) });
  } catch (err) {
    console.error('[/api/start-sit/top-starts] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
