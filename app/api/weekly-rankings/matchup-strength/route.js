import { createClient } from '@supabase/supabase-js';
import { computeMatchupTiers } from '@/lib/matchupStrength';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// The season currently in progress — bump this once the 2027 season starts.
const CURRENT_SEASON = 2026;
const SEASON_TYPE = 'regular';
const PAGE = 1000;

// team -> position -> 'red'/'yellow'/'green' Defense-vs-Position rating,
// derived from real game stats (see lib/matchupStrength.js) rather than
// Sleeper's own unpublished matchup rating.
export async function GET() {
  try {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase()
        .from('player_week_stats')
        .select('position, opponent, week, fantasy_points')
        .eq('season', CURRENT_SEASON)
        .eq('season_type', SEASON_TYPE)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return Response.json({ tiers: computeMatchupTiers(rows) });
  } catch (err) {
    console.error('[/api/weekly-rankings/matchup-strength] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
