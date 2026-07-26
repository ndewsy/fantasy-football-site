import { createClient } from '@supabase/supabase-js';

let _sb;
const sb = () => (_sb ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function GET(request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authErr } = await sb().auth.getUser(token);
  if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Check whether the season has any graded games yet
  const { data: finalGames, error: gErr } = await sb()
    .from('season_games')
    .select('id, winner')
    .eq('status', 'final');

  if (gErr) return Response.json({ error: gErr.message }, { status: 500 });

  const gamesGraded = finalGames?.length ?? 0;
  if (gamesGraded === 0) return Response.json({ gamesGraded: 0, entries: [] });

  // Build a lookup: game_id → winning side ('home'|'away')
  const winnerOf = Object.fromEntries((finalGames ?? []).map(g => [g.id, g.winner]));

  // Fetch every pick in the season (service role — no RLS filter needed)
  const { data: allPicks, error: pErr } = await sb()
    .from('season_picks')
    .select('user_id, game_id, pick');

  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

  // Aggregate per user: total picks + correct picks on graded games
  const byUser = {};
  for (const pk of (allPicks ?? [])) {
    if (!byUser[pk.user_id]) byUser[pk.user_id] = { total: 0, correct: 0 };
    byUser[pk.user_id].total++;
    if (pk.game_id in winnerOf && winnerOf[pk.game_id] === pk.pick) {
      byUser[pk.user_id].correct++;
    }
  }

  // Only users who submitted all 272 picks qualify
  const qualifyingIds = Object.entries(byUser)
    .filter(([, v]) => v.total === 272)
    .map(([id]) => id);

  if (qualifyingIds.length === 0) return Response.json({ gamesGraded, entries: [] });

  // Fetch display names for qualifying users
  const { data: profiles, error: prErr } = await sb()
    .from('profiles')
    .select('id, display_name')
    .in('id', qualifyingIds);

  if (prErr) return Response.json({ error: prErr.message }, { status: 500 });

  const nameOf = Object.fromEntries((profiles ?? []).map(p => [p.id, p.display_name]));

  // Build sorted leaderboard entries
  const entries = qualifyingIds.map(uid => ({
    user_id:      uid,
    display_name: nameOf[uid] || 'Anonymous',
    correct:      byUser[uid].correct,
    graded:       gamesGraded,
    pct:          byUser[uid].correct / gamesGraded,
  }));

  entries.sort((a, b) => b.pct - a.pct || b.correct - a.correct);

  // Assign ranks — tied entries share a rank; next rank skips accordingly
  let rank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && (entries[i].pct !== entries[i - 1].pct || entries[i].correct !== entries[i - 1].correct)) {
      rank = i + 1;
    }
    entries[i].rank = rank;
  }

  return Response.json({ gamesGraded, entries });
}
