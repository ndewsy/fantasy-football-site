import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');
  if (!playerId) return Response.json({ error: 'playerId is required' }, { status: 400 });

  const { data, error } = await supabase()
    .from('player_season_stats')
    .select('season, season_type, position, games_played, stats, fantasy_points, fantasy_finish')
    .eq('player_id', playerId)
    .eq('season_type', 'regular')
    .order('season', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ seasonStats: data || null });
}
