import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// Only surfaces players who currently have at least one upcoming prop line —
// there's nothing to project for anyone else, so no point showing them in the picker.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (q.length < 2) return Response.json({ players: [] });

  // Single query: name match + an inner join on player_prop_lines filtered
  // to upcoming games, in one round trip. A player can have multiple prop
  // lines for the same game (one row per stat), so dedupe by id after.
  const { data, error } = await supabase()
    .from('players')
    .select('id, name, position, team, espn_id, sleeper_id, player_prop_lines!inner(game_starts_at)')
    .ilike('name', `%${q}%`)
    .gt('player_prop_lines.game_starts_at', new Date().toISOString())
    .limit(50);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const seen = new Set();
  const players = [];
  for (const { player_prop_lines, ...p } of data || []) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    players.push(p);
    if (players.length >= 15) break;
  }
  return Response.json({ players });
}
