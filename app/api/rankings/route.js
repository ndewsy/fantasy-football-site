import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// players column stores { ranked: [...], unranked: [...] } OR a legacy flat array.
// Legacy flat arrays may embed unranked players inline with an `unranked: true` property,
// so we split on that flag rather than treating the entire array as ranked.
function parsePlayers(raw) {
  if (!raw) return { ranked: [], unranked: [] };
  if (Array.isArray(raw)) {
    const ranked = raw.filter(p => !p.unranked).map(({ unranked: _, ...p }) => p);
    const unranked = raw.filter(p => p.unranked).map(({ unranked: _, ...p }) => p);
    return { ranked, unranked };
  }
  return {
    ranked: Array.isArray(raw.ranked) ? raw.ranked : [],
    unranked: Array.isArray(raw.unranked) ? raw.unranked : [],
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const creator_id = searchParams.get('creator_id');
  const format = searchParams.get('format');

  // creator_id + format → specific players (individual creator tab on homepage)
  if (creator_id && format) {
    const { data, error } = await supabase()
      .from('rankings')
      .select('players, tiers, updated_at, locked, break_rank')
      .eq('creator_id', creator_id)
      .eq('format', format)
      .maybeSingle();
    if (error) {
      console.error('[/api/rankings GET] fetch failed:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    const { ranked, unranked } = parsePlayers(data?.players);
    return Response.json({ players: ranked, unranked, tiers: data?.tiers || [], updatedAt: data?.updated_at || null, locked: data?.locked || false, break_rank: data?.break_rank ?? null });
  }

  // format only → all creators for that format (consensus tab on homepage)
  if (format) {
    const { data, error } = await supabase()
      .from('rankings')
      .select('creator_id, players, updated_at, locked')
      .eq('format', format);
    if (error) {
      console.error('[/api/rankings GET] fetch failed:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    const rankings = (data || []).map(row => {
      const { ranked } = parsePlayers(row.players);
      return { creator_id: row.creator_id, players: ranked, updated_at: row.updated_at, locked: row.locked || false };
    });
    return Response.json({ rankings });
  }

  // creator_id only → all formats for that creator (dashboard load)
  if (creator_id) {
    const { data, error } = await supabase()
      .from('rankings')
      .select('format, players, tiers, updated_at, locked, break_rank')
      .eq('creator_id', creator_id)
      .order('updated_at', { ascending: true });
    if (error) {
      console.error('[/api/rankings GET] fetch failed:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    const rankings = (data || []).map(row => {
      const rawPlayers = row.players;
      const { ranked, unranked } = parsePlayers(rawPlayers);
      console.log(`[/api/rankings GET] format="${row.format}" rawType=${Array.isArray(rawPlayers) ? 'flat-array' : typeof rawPlayers} rankedCount=${ranked.length} unrankedCount=${unranked.length}`);
      return { format: row.format, players: ranked, unranked, tiers: row.tiers || [], updated_at: row.updated_at, locked: row.locked || false, break_rank: row.break_rank ?? null };
    });
    return Response.json({ rankings });
  }

  return Response.json({ error: 'Missing required params: creator_id and/or format' }, { status: 400 });
}

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { creator_id, format, players, unranked, tiers } = body;

  if (!creator_id || !format || !Array.isArray(players)) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify the authenticated user owns this creator_id
  const { data: profile, error: profileError } = await supabase()
    .from('profiles')
    .select('creator_id')
    .eq('id', user.id)
    .maybeSingle();

  console.log('[/api/rankings] profile lookup:', { userId: user.id, profile, profileError });

  if (!profile || profile.creator_id !== creator_id) {
    console.log('[/api/rankings] forbidden — profile.creator_id:', profile?.creator_id, '!== requested:', creator_id);
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Pack both arrays into a single { ranked, unranked } object on the players column.
  const playersPayload = {
    ranked: players,
    unranked: Array.isArray(unranked) ? unranked : [],
  };

  console.log('[/api/rankings] upserting:', { creator_id, format, rankedCount: players.length, unrankedCount: playersPayload.unranked.length });

  const { data: upsertData, error: upsertError } = await supabase()
    .from('rankings')
    .upsert(
      {
        creator_id,
        format,
        players: playersPayload,
        tiers: Array.isArray(tiers) ? tiers : [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'creator_id,format' }
    )
    .select();

  console.log('[/api/rankings] upsert result:', { upsertData, upsertError });

  if (upsertError) {
    console.error('[/api/rankings] upsert failed:', upsertError);
    return Response.json({ error: upsertError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function PATCH(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { creator_id, format } = body;

  if (!creator_id || !format) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const update = {};
  if ('locked' in body && typeof body.locked === 'boolean') update.locked = body.locked;
  if ('break_rank' in body) update.break_rank = body.break_rank == null ? null : Number(body.break_rank);

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: prof } = await supabase()
    .from('profiles')
    .select('creator_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!prof || (prof.creator_id !== creator_id && prof.role !== 'admin')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error: updateError } = await supabase()
    .from('rankings')
    .update(update)
    .eq('creator_id', creator_id)
    .eq('format', format);

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ ok: true });
}
