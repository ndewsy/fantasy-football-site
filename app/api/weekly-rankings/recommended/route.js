import { createClient } from '@supabase/supabase-js';
import { getCurrentWeekFromGames } from '@/lib/currentWeek';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// The season currently in progress — bump this once the 2027 season starts.
const CURRENT_SEASON = 2026;
const SEASON_TYPE = 'regular';
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const SCORING_TO_SLEEPER_KEY = { ppr: 'pts_ppr', half_ppr: 'pts_half_ppr', standard: 'pts_std' };

// Top-N players for a position, ranked by Sleeper's own weekly projections
// (rather than this site's prop-line-derived projection) — used to seed the
// Weekly Rankings editor's "recommended" list with a source creators already
// recognize from Sleeper itself.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const position = POSITIONS.includes(searchParams.get('position')) ? searchParams.get('position') : null;
  if (!position) {
    return Response.json({ error: 'position is required (QB, RB, WR, or TE)' }, { status: 400 });
  }
  const parsedLimit = parseInt(searchParams.get('limit'), 10);
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const scoringKey = SCORING_TO_SLEEPER_KEY[searchParams.get('scoring')] || SCORING_TO_SLEEPER_KEY.ppr;

  try {
    const { data: games, error: gamesError } = await supabase()
      .from('season_games')
      .select('week, status, kickoff_at')
      .order('kickoff_at', { ascending: true });
    if (gamesError) throw gamesError;
    const week = getCurrentWeekFromGames(games || []);

    const res = await fetch(`https://api.sleeper.app/projections/nfl/${CURRENT_SEASON}/${week}?season_type=${SEASON_TYPE}`);
    if (!res.ok) throw new Error(`Sleeper projections fetch failed: ${res.status}`);
    const entries = await res.json();

    const bySleeperId = new Map();
    for (const e of entries) {
      if (e.player?.position !== position) continue;
      const pts = e.stats?.[scoringKey];
      if (typeof pts !== 'number') continue;
      // Sleeper occasionally lists a player under more than one entry for a
      // week (e.g. a mid-week team change) — keep the higher projection.
      const existing = bySleeperId.get(e.player_id);
      if (!existing || pts > existing) bySleeperId.set(e.player_id, pts);
    }
    if (bySleeperId.size === 0) {
      return Response.json({ week, position, topStarts: [] });
    }

    const players = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase()
        .from('players')
        .select('id, name, position, team, espn_id, sleeper_id')
        .eq('position', position)
        .in('sleeper_id', [...bySleeperId.keys()])
        .range(from, from + PAGE - 1);
      if (error) throw error;
      players.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    const projected = players
      .map((p) => ({ player: p, projectedPoints: bySleeperId.get(p.sleeper_id) }))
      .sort((a, b) => b.projectedPoints - a.projectedPoints)
      .slice(0, limit);

    return Response.json({ week, position, topStarts: projected });
  } catch (err) {
    console.error('[/api/weekly-rankings/recommended] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
