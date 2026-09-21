import { createClient } from '@supabase/supabase-js';
import { computeProjection, buildProjectionLines } from '@/lib/fantasyProjection';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// The season currently in progress — bump this once the 2027 season starts.
// Matches the constant in app/api/start-sit/compare/route.js.
const CURRENT_SEASON = 2026;
const PROJECTABLE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
// Weekly Rankings is Huddle-only for now (see the weekly_rankings migration).
const HUDDLE_CREATOR_ID = 'ffhuddle';

// Powers the player card's "Next Game" section: the upcoming matchup's
// over/under and team implied total (from game_lines, same source as
// Start/Sit), this site's own projected fantasy points (same projection
// engine as Start/Sit and the weekly-rankings Recommended panel), and the
// player's current spot in FFHuddle's own Weekly Rankings for their
// position — a completely different signal (a human's opinion) from the
// two market/model-derived numbers above it.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');
  if (!playerId) return Response.json({ error: 'playerId is required' }, { status: 400 });

  try {
    const { data: player, error: playerError } = await supabase()
      .from('players')
      .select('id, position, rookie_year')
      .eq('id', playerId)
      .maybeSingle();
    if (playerError) throw playerError;
    if (!player) return Response.json({ error: 'Player not found' }, { status: 404 });

    const { data: lines, error: linesError } = await supabase()
      .from('player_prop_lines')
      .select('*')
      .eq('player_id', playerId)
      .gt('game_starts_at', new Date().toISOString())
      .order('game_starts_at', { ascending: true });
    if (linesError) throw linesError;

    let nextGame = null;
    if (lines && lines.length > 0) {
      // All rows for a player's *next* game share the same event id — later
      // games (already sorted ascending) aren't this week's matchup.
      const nextEventId = lines[0].sgo_event_id;
      const nextLines = lines.filter((l) => l.sgo_event_id === nextEventId);
      const homeAway = nextLines[0].home_away;

      const [seasonStatsResult, gameLineResult] = await Promise.all([
        supabase().from('player_season_stats').select('games_played, stats').eq('player_id', playerId).order('season', { ascending: false }).limit(1),
        supabase().from('game_lines').select('game_total, home_team_total, away_team_total').eq('sgo_event_id', nextEventId).maybeSingle(),
      ]);
      if (seasonStatsResult.error) throw seasonStatsResult.error;
      if (gameLineResult.error) throw gameLineResult.error;

      let projectedPoints = null;
      if (PROJECTABLE_POSITIONS.has(player.position)) {
        const isRookie = player.rookie_year === CURRENT_SEASON;
        const seasonStats = seasonStatsResult.data?.[0] || null;
        const { lines: projectionLines } = buildProjectionLines(player.position, nextLines, seasonStats, isRookie);
        projectedPoints = computeProjection(projectionLines, 'ppr').total;
      }

      const gameLine = gameLineResult.data;
      nextGame = {
        gameStartsAt: nextLines[0].game_starts_at,
        opponentId: nextLines[0].opponent_id,
        homeAway,
        gameTotal: gameLine?.game_total ?? null,
        teamImpliedTotal: gameLine ? (homeAway === 'home' ? gameLine.home_team_total : gameLine.away_team_total) : null,
        projectedPoints,
      };
    }

    // Most recently published week Huddle has ranked this player at this
    // position — not necessarily *this* week specifically (Weekly Rankings
    // can lag a day or two behind a fresh slate), same "latest available"
    // fallback the public Weekly Rankings page itself uses.
    const { data: huddleRows, error: huddleError } = await supabase()
      .from('weekly_rankings')
      .select('week, rank')
      .eq('creator_id', HUDDLE_CREATOR_ID)
      .eq('position', player.position)
      .eq('player_id', playerId)
      .order('week', { ascending: false })
      .limit(1);
    if (huddleError) throw huddleError;

    return Response.json({ nextGame, huddleRank: huddleRows?.[0] || null });
  } catch (err) {
    console.error('[/api/player-next-game] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
