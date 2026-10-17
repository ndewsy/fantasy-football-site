import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// The season currently in progress — matches the constant in
// app/api/cron/sync-week-stats/route.js and app/api/player-stats/route.js.
const CURRENT_SEASON = 2026;
const PROJECTABLE_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

// Supabase caps an unpaginated select at 1000 rows — both queries below
// (player_week_stats across a whole season, and every QB/RB/WR/TE in
// players) already exceed that, so each pages through in batches.
async function loadAll(buildQuery) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data: batch, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(batch || []));
    if (!batch || batch.length < PAGE) break;
  }
  return rows;
}

// Total/average full-PPR points for every skill-position player this
// season, for the /players leaderboard page. fantasy_points on
// player_week_stats is already precomputed (full PPR, see
// fantasyPointsFromRealStats), so this just sums/counts it per player
// rather than recomputing from raw stats.
export async function GET() {
  let weekRows, players;
  try {
    [weekRows, players] = await Promise.all([
      loadAll(() =>
        supabase()
          .from('player_week_stats')
          .select('player_id, fantasy_points')
          .eq('season', CURRENT_SEASON)
          .eq('season_type', 'regular')
          .not('fantasy_points', 'is', null)
          .order('id')
      ),
      loadAll(() =>
        supabase()
          .from('players')
          .select('id, name, position, team, espn_id, sleeper_id')
          .in('position', PROJECTABLE_POSITIONS)
          .order('id')
      ),
    ]);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  const totals = new Map(); // player_id -> { total, games }
  for (const row of weekRows || []) {
    const entry = totals.get(row.player_id) || { total: 0, games: 0 };
    entry.total += Number(row.fantasy_points) || 0;
    entry.games += 1;
    totals.set(row.player_id, entry);
  }

  const byId = new Map((players || []).map((p) => [p.id, p]));
  const rows = [];
  for (const [playerId, { total, games }] of totals) {
    const p = byId.get(playerId);
    if (!p) continue; // not a projectable skill position, or not found
    rows.push({
      id: p.id,
      name: p.name,
      position: p.position,
      team: p.team,
      espn_id: p.espn_id,
      sleeper_id: p.sleeper_id,
      gamesPlayed: games,
      totalPoints: Math.round(total * 100) / 100,
      avgPoints: Math.round((total / games) * 100) / 100,
    });
  }

  return Response.json({ season: CURRENT_SEASON, players: rows });
}
