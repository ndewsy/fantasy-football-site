import { createClient } from '@supabase/supabase-js';
import { fantasyPointsFromRealStats } from '@/lib/fantasyProjection';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// The season currently in progress — bump this once the 2027 season starts.
// Matches the constant in app/api/cron/sync-week-stats/route.js.
const CURRENT_SEASON = 2026;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');
  if (!playerId) return Response.json({ error: 'playerId is required' }, { status: 400 });

  const [seasonStatsResult, playerResult, weekStatsResult] = await Promise.all([
    supabase()
      .from('player_season_stats')
      .select('season, season_type, position, games_played, stats, fantasy_points, fantasy_finish')
      .eq('player_id', playerId)
      .eq('season_type', 'regular')
      .order('season', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase().from('players').select('team').eq('id', playerId).maybeSingle(),
    supabase()
      .from('player_week_stats')
      .select('week, position, stats')
      .eq('player_id', playerId)
      .eq('season', CURRENT_SEASON)
      .eq('season_type', 'regular')
      .order('week', { ascending: false }),
  ]);

  if (seasonStatsResult.error) return Response.json({ error: seasonStatsResult.error.message }, { status: 500 });
  if (weekStatsResult.error) return Response.json({ error: weekStatsResult.error.message }, { status: 500 });

  let gameLog = [];
  if (weekStatsResult.data?.length > 0) {
    const weeks = weekStatsResult.data.map((r) => r.week);
    const { data: games, error: gamesError } = await supabase()
      .from('season_games')
      .select('week, home_team, away_team')
      .in('week', weeks);
    if (gamesError) return Response.json({ error: gamesError.message }, { status: 500 });

    const team = playerResult.data?.team;
    const gameByWeek = new Map();
    for (const g of games || []) {
      if (g.home_team === team || g.away_team === team) gameByWeek.set(g.week, g);
    }

    gameLog = weekStatsResult.data.map((row) => {
      const game = gameByWeek.get(row.week);
      const s = row.stats || {};
      const fantasyPoints = fantasyPointsFromRealStats({
        passYd: s.pass_yd, passTd: s.pass_td,
        rushYd: s.rush_yd, rushTd: s.rush_td,
        recYd: s.rec_yd, recTd: s.rec_td, rec: s.rec,
      });
      return {
        week: row.week,
        position: row.position,
        stats: s,
        fantasyPoints,
        opponent: game ? (game.home_team === team ? game.away_team : game.home_team) : null,
        homeAway: game ? (game.home_team === team ? 'home' : 'away') : null,
      };
    });

    // That week's positional finish (e.g. "RB3") — ranks this player against
    // every other player at the same position who has a stat line the same
    // week, same way sync-season-stats ranks the season-long fantasy_finish.
    // One query for the whole position across the season rather than one
    // per week in the log.
    const position = weekStatsResult.data[0]?.position;
    if (position) {
      const { data: positionRows, error: positionError } = await supabase()
        .from('player_week_stats')
        .select('player_id, week, stats')
        .eq('season', CURRENT_SEASON)
        .eq('season_type', 'regular')
        .eq('position', position);
      if (positionError) return Response.json({ error: positionError.message }, { status: 500 });

      const byWeek = new Map();
      for (const row of positionRows || []) {
        const s = row.stats || {};
        const points = fantasyPointsFromRealStats({
          passYd: s.pass_yd, passTd: s.pass_td,
          rushYd: s.rush_yd, rushTd: s.rush_td,
          recYd: s.rec_yd, recTd: s.rec_td, rec: s.rec,
        });
        if (!byWeek.has(row.week)) byWeek.set(row.week, []);
        byWeek.get(row.week).push({ player_id: row.player_id, points });
      }

      const numericPlayerId = Number(playerId);
      for (const entry of gameLog) {
        const weekRows = (byWeek.get(entry.week) || []).sort((a, b) => b.points - a.points);
        const idx = weekRows.findIndex((r) => r.player_id === numericPlayerId);
        entry.positionalFinish = idx >= 0 ? idx + 1 : null;
      }
    }
  }

  return Response.json({ seasonStats: seasonStatsResult.data || null, gameLog });
}
