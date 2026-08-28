import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

const FORMATS = ['Auction 1QB', 'Auction SF'];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const creator_id = searchParams.get('creator_id');
  const format = searchParams.get('format');

  if (creator_id && format) {
    const { data, error } = await supabase()
      .from('auction_rankings')
      .select('players, team_build_description, locked, updated_at')
      .eq('creator_id', creator_id)
      .eq('format', format)
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({
      players: data?.players || [],
      teamBuildDescription: data?.team_build_description || '',
      locked: data?.locked || false,
      updatedAt: data?.updated_at || null,
    });
  }

  if (format) {
    const { data, error } = await supabase()
      .from('auction_rankings')
      .select('creator_id, players, team_build_description, updated_at')
      .eq('format', format);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ boards: data || [] });
  }

  if (creator_id) {
    const { data, error } = await supabase()
      .from('auction_rankings')
      .select('format, players, team_build_description, locked, updated_at')
      .eq('creator_id', creator_id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ boards: data || [] });
  }

  return Response.json({ error: 'Missing required params: creator_id and/or format' }, { status: 400 });
}

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { creator_id, format, players, teamBuildDescription } = body;

  if (!creator_id || !FORMATS.includes(format)) {
    return Response.json({ error: 'creator_id and a valid format are required' }, { status: 400 });
  }
  if (players !== undefined && !Array.isArray(players)) {
    return Response.json({ error: 'players must be an array' }, { status: 400 });
  }

  const { data: profile } = await supabase()
    .from('profiles')
    .select('creator_id, role')
    .eq('id', user.id)
    .maybeSingle();

  const isOwner = profile?.creator_id === creator_id;
  const isAdmin = profile?.role === 'admin';
  if (!isOwner && !isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const update = { creator_id, format, updated_at: new Date().toISOString() };
  if (players !== undefined) {
    update.players = players.map((p) => ({
      player_id: Number(p.player_id),
      pct: p.pct === null || p.pct === '' || p.pct === undefined ? null : Number(p.pct),
    }));
  }
  if (teamBuildDescription !== undefined) update.team_build_description = teamBuildDescription;

  const { error: upsertError } = await supabase()
    .from('auction_rankings')
    .upsert(update, { onConflict: 'creator_id,format' });

  if (upsertError) return Response.json({ error: upsertError.message }, { status: 500 });
  return Response.json({ ok: true });
}
