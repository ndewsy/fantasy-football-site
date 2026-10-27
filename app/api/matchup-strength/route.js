import { createClient } from '@supabase/supabase-js';
import { computeMatchupStats, computeMatchupHistory, tiersFromStats } from '@/lib/matchupStrength';
import { getTuesdayResetWeek } from '@/lib/currentWeek';
import { ensureFreshWeekStats } from '@/lib/syncWeekStats';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// The season currently in progress — bump this once the 2027 season starts.
const CURRENT_SEASON = 2026;
const SEASON_TYPE = 'regular';
const PAGE = 1000;
const HISTORY_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

// .range()-based pagination needs a deterministic .order() — without one,
// Postgres can return rows in a different order between page requests, so
// the same row can land on two pages and get double-counted. player_week_stats
// alone is already past the 1000-row page size this season.
async function fetchAllRows(table, selectCols, applyFilters) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase().from(table).select(selectCols).order('id').range(from, from + PAGE - 1);
    if (applyFilters) query = applyFilters(query);
    const { data, error } = await query;
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

// Defense-vs-Position "strength of matchup" — see lib/matchupStrength.js.
// Returns the compact team->position->tier map (for coloring a single
// matchup badge), the full per-position breakdown (rank, avg/high/low
// points allowed), who scored what against each defense, and each team's actual next opponent — all for the
// same "active week", which only advances Tuesday morning rather than
// the instant the last game of the week ends.
export async function GET() {
  try {
    await ensureFreshWeekStats();
  } catch (err) {
    console.error('[/api/matchup-strength] on-demand sync failed:', err);
  }

  try {
    const games = await fetchAllRows('season_games', 'week, status, kickoff_at, home_team, away_team');
    const week = getTuesdayResetWeek(games);

    const weekStatsRows = await fetchAllRows(
      'player_week_stats',
      'player_id, position, opponent, week, fantasy_points',
      (q) => q.eq('season', CURRENT_SEASON).eq('season_type', SEASON_TYPE)
    );

    const stats = computeMatchupStats(weekStatsRows, week);

    // Names for the per-team drill-down, chunked so the .in() list stays
    // well under URL length limits.
    const historyRows = weekStatsRows.filter((r) => HISTORY_POSITIONS.includes(r.position) && r.week < week);
    const playerIds = [...new Set(historyRows.map((r) => r.player_id))];
    const namesById = {};
    for (let i = 0; i < playerIds.length; i += 300) {
      const { data, error } = await supabase().from('players').select('id, name').in('id', playerIds.slice(i, i + 300));
      if (error) throw error;
      for (const p of data || []) namesById[p.id] = p.name;
    }

    const offenseByWeekTeam = {};
    for (const g of games) {
      if (!g.home_team || !g.away_team) continue;
      offenseByWeekTeam[`${g.week}|${g.home_team}`] = g.away_team;
      offenseByWeekTeam[`${g.week}|${g.away_team}`] = g.home_team;
    }
    const history = computeMatchupHistory(historyRows, week, namesById, offenseByWeekTeam);

    const nextMatchups = {};
    for (const g of games) {
      if (g.week !== week || !g.home_team || !g.away_team) continue;
      nextMatchups[g.home_team] = { opponent: g.away_team, homeAway: 'home' };
      nextMatchups[g.away_team] = { opponent: g.home_team, homeAway: 'away' };
    }

    return Response.json({ week, weeksUsed: week - 1, stats, tiers: tiersFromStats(stats), nextMatchups, history });
  } catch (err) {
    console.error('[/api/matchup-strength] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
