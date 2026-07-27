import { createClient } from '@supabase/supabase-js';

let _sb;
const sb = () => (_sb ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

async function getUser(request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await sb().auth.getUser(token);
  return error ? null : user;
}

// GET — returns all games; adds the user's picks if authenticated
export async function GET(request) {
  const user = await getUser(request);

  const { data: games, error: gErr } = await sb()
    .from('season_games').select('*').order('week').order('kickoff_at');
  if (gErr) return Response.json({ error: gErr.message }, { status: 500 });

  if (!user) return Response.json({ games: games ?? [], picks: [] });

  const { data: picks, error: pErr } = await sb()
    .from('season_picks').select('game_id, pick').eq('user_id', user.id);
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

  return Response.json({ games: games ?? [], picks: picks ?? [] });
}

// POST — upsert a single pick; database trigger rejects writes once season starts
export async function POST(request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { game_id, pick } = await request.json();
  if (!game_id || !['home', 'away'].includes(pick)) {
    return Response.json({ error: 'game_id and pick ("home"|"away") are required' }, { status: 400 });
  }

  const { error } = await sb().from('season_picks').upsert(
    { user_id: user.id, game_id, pick, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,game_id' }
  );

  if (error) {
    if (error.message?.includes('Picks are locked')) {
      return Response.json({ error: 'Picks are locked — the season has started' }, { status: 423 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
