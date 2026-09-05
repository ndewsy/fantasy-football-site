import { createClient } from '@supabase/supabase-js';
import { computeProjection, missingStatLabels, computeConfidence, SCORING_FORMATS } from '@/lib/fantasyProjection';

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
  const homeAway = nextLines[0].home_away;

  const { data: gameLine, error: gameLineError } = await supabase()
    .from('game_lines')
    .select('game_total, home_team_total, away_team_total')
    .eq('sgo_event_id', nextEventId)
    .maybeSingle();
  if (gameLineError) throw gameLineError;

  return {
    player,
    hasGame: true,
    gameStartsAt: nextLines[0].game_starts_at,
    opponentId: nextLines[0].opponent_id,
    homeAway,
    projection,
    missingStats,
    gameTotal: gameLine?.game_total ?? null,
    teamImpliedTotal: gameLine ? (homeAway === 'home' ? gameLine.home_team_total : gameLine.away_team_total) : null,
  };
}

// Marks, on each player's breakdown row, whether that player's raw stat line
// beats the other player's for the same category — higher is better for
// every stat this projection tracks (yards, receptions, TD odds), so a
// straight comparison is safe. Stats only one player has posted (see
// missingStatLabels) are left unmarked rather than treated as a loss.
function annotateStatWinners(playerA, playerB) {
  if (!playerA.hasGame || !playerB.hasGame) return;
  const bById = Object.fromEntries(playerB.projection.breakdown.map((b) => [b.statId, b]));
  for (const a of playerA.projection.breakdown) {
    const b = bById[a.statId];
    if (!b || a.line === b.line) continue;
    if (a.line > b.line) a.winsStat = true; else b.winsStat = true;
  }
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

  annotateStatWinners(results[0], results[1]);

  const withGames = results.filter((r) => r.hasGame);
  let recommendedPlayerId = null;
  let confidence = null;
  if (withGames.length >= 2) {
    recommendedPlayerId = withGames.reduce((best, r) =>
      r.projection.total > best.projection.total ? r : best
    ).player.id;
    confidence = computeConfidence(withGames[0].projection.total, withGames[1].projection.total);
  } else if (withGames.length === 1) {
    // Only one of the two has an upcoming projectable game — easy call.
    recommendedPlayerId = withGames[0].player.id;
  }

  return Response.json({ scoring, players: results, recommendedPlayerId, confidence });
}
