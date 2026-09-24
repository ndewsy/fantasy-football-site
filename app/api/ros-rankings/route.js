import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

function emptyPositionMap() {
  return Object.fromEntries(POSITIONS.map((p) => [p, []]));
}

function emptyTiersMap() {
  return Object.fromEntries(POSITIONS.map((p) => [p, []]));
}

// Rest-of-Season Rankings — same shape as /api/weekly-rankings but with no
// week dimension: one continuously-updated list per creator+position.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const creator_id = searchParams.get('creator_id');
  if (!creator_id) {
    return Response.json({ error: 'creator_id is required' }, { status: 400 });
  }

  const selectCols = 'id, creator_id, position, player_id, rank, players(name, position, team, espn_id, sleeper_id)';

  const [{ data, error }, { data: tierRows, error: tierError }, { data: noteRow, error: noteError }] = await Promise.all([
    supabase().from('ros_rankings').select(selectCols).eq('creator_id', creator_id).order('rank'),
    supabase().from('ros_ranking_tiers').select('position, tiers').eq('creator_id', creator_id),
    supabase().from('ros_rankings_notes').select('note').eq('creator_id', creator_id).maybeSingle(),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (tierError) return Response.json({ error: tierError.message }, { status: 500 });
  if (noteError) return Response.json({ error: noteError.message }, { status: 500 });

  const positions = emptyPositionMap();
  for (const row of data || []) positions[row.position]?.push(row);

  const tiers = emptyTiersMap();
  for (const row of tierRows || []) tiers[row.position] = row.tiers || [];

  return Response.json({ positions, tiers, note: noteRow?.note || '' });
}

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { creator_id, position, entries, tiers } = body;

  if (!creator_id || !POSITIONS.includes(position)) {
    return Response.json({ error: 'creator_id and a valid position are required' }, { status: 400 });
  }
  if (!Array.isArray(entries)) {
    return Response.json({ error: 'entries must be an array' }, { status: 400 });
  }
  for (const e of entries) {
    if (!Number.isInteger(Number(e.player_id))) {
      return Response.json({ error: 'each entry needs a player_id' }, { status: 400 });
    }
  }
  if (tiers !== undefined && (!Array.isArray(tiers) || tiers.some((t) => !Number.isInteger(t) || t < 1))) {
    return Response.json({ error: 'tiers must be an array of positive integers' }, { status: 400 });
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

  const { error: deleteError } = await supabase()
    .from('ros_rankings')
    .delete()
    .eq('creator_id', creator_id)
    .eq('position', position);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

  if (entries.length > 0) {
    const rows = entries.map((e, i) => ({
      creator_id,
      position,
      player_id: Number(e.player_id),
      rank: i + 1,
      updated_at: new Date().toISOString(),
    }));
    const { error: insertError } = await supabase().from('ros_rankings').insert(rows);
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
  }

  if (tiers !== undefined) {
    const { error: tiersError } = await supabase()
      .from('ros_ranking_tiers')
      .upsert(
        { creator_id, position, tiers, updated_at: new Date().toISOString() },
        { onConflict: 'creator_id,position' }
      );
    if (tiersError) return Response.json({ error: tiersError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
