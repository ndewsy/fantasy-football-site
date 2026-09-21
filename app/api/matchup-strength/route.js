import { createClient } from '@supabase/supabase-js';
import { computeMatchupStats, tiersFromStats } from '@/lib/matchupStrength';
import { getTuesdayResetWeek } from '@/lib/currentWeek';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// The season currently in progress — bump this once the 2027 season starts.
const CURRENT_SEASON = 2026;
const SEASON_TYPE = 'regular';
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

// Defense-vs-Position "strength of matchup" — see lib/matchupStrength.js.
// Returns the compact team->position->tier map (for coloring a single
// matchup badge), the full per-position breakdown (rank, avg/high/low
// points allowed), and each team's actual next opponent — all for the
// same "active week", which only advances Tuesday morning rather than
// the instant the last game of the week ends.
export async function GET() {
  try {
    const games = await fetchAllRows('season_games', 'week, status, kickoff_at, home_team, away_team');
    const week = getTuesdayResetWeek(games);

    const weekStatsRows = await fetchAllRows(
      'player_week_stats',
      'position, opponent, week, fantasy_points',
      (q) => q.eq('season', CURRENT_SEASON).eq('season_type', SEASON_TYPE)
    );

    const stats = computeMatchupStats(weekStatsRows, week);

    const nextMatchups = {};
    for (const g of games) {
      if (g.week !== week || !g.home_team || !g.away_team) continue;
      nextMatchups[g.home_team] = { opponent: g.away_team, homeAway: 'home' };
      nextMatchups[g.away_team] = { opponent: g.home_team, homeAway: 'away' };
    }

    return Response.json({ week, weeksUsed: week - 1, stats, tiers: tiersFromStats(stats), nextMatchups });
  } catch (err) {
    console.error('[/api/matchup-strength] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
