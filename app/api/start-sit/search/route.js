import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// Only surfaces players who currently have at least one upcoming prop line —
// there's nothing to project for anyone else, so no point showing them in the picker.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (q.length < 2) return Response.json({ players: [] });

  const { data: withLines, error: linesError } = await supabase()
    .from('player_prop_lines')
    .select('player_id')
    .gt('game_starts_at', new Date().toISOString());
  if (linesError) return Response.json({ error: linesError.message }, { status: 500 });

  const playerIds = [...new Set((withLines || []).map((r) => r.player_id))];
  if (playerIds.length === 0) return Response.json({ players: [] });

  const { data, error } = await supabase()
    .from('players')
    .select('id, name, position, team, espn_id, sleeper_id')
    .in('id', playerIds)
    .ilike('name', `%${q}%`)
    .limit(15);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ players: data || [] });
}
