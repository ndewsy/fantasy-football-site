import { createClient } from '@supabase/supabase-js';
import { computeProjection, missingStatLabels, SCORING_FORMATS } from '@/lib/fantasyProjection';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

async function loadPlayer(playerId, scoring) {
  const { data: player, error: playerError } = await supabase()
    .from('players')
    .select('id, name, position, team, espn_id, sleeper_id')
    .eq('id', playerId)
    .maybeSingle();
  if (playerError) throw playerError;
  if (!player) return null;

  const { data: lines, error: linesError } = await supabase()
    .from('player_prop_lines')
    .select('*')
    .eq('player_id', playerId)
    .gt('game_starts_at', new Date().toISOString())
    .order('game_starts_at', { ascending: true });
  if (linesError) throw linesError;
  if (!lines || lines.length === 0) return { player, hasGame: false };

  // All rows for a player's *next* game share the same event id — later games
  // (already sorted ascending) get ignored for a single start/sit decision.
  const nextEventId = lines[0].sgo_event_id;
  const nextLines = lines.filter((l) => l.sgo_event_id === nextEventId);
  const projection = computeProjection(nextLines, scoring);
  const missingStats = missingStatLabels(player.position, nextLines);

  return {
    player,
    hasGame: true,
    gameStartsAt: nextLines[0].game_starts_at,
    opponentId: nextLines[0].opponent_id,
    homeAway: nextLines[0].home_away,
    projection,
    missingStats,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('playerIds') || '';
  const scoring = SCORING_FORMATS.includes(searchParams.get('scoring')) ? searchParams.get('scoring') : 'ppr';

  const playerIds = idsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  if (playerIds.length < 2) {
    return Response.json({ error: 'playerIds must contain at least 2 player ids' }, { status: 400 });
  }

  let results;
  try {
    results = await Promise.all(playerIds.map((id) => loadPlayer(id, scoring)));
  } catch (err) {
    console.error('[/api/start-sit/compare] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }

  if (results.some((r) => !r)) {
    return Response.json({ error: 'One or more players not found' }, { status: 404 });
  }

  const withGames = results.filter((r) => r.hasGame);
  let recommendedPlayerId = null;
  if (withGames.length >= 2) {
    recommendedPlayerId = withGames.reduce((best, r) =>
      r.projection.total > best.projection.total ? r : best
    ).player.id;
  } else if (withGames.length === 1) {
    // Only one of the two has an upcoming projectable game — easy call.
    recommendedPlayerId = withGames[0].player.id;
  }

  return Response.json({ scoring, players: results, recommendedPlayerId });
}
