import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

const CATEGORIES = ['drop', 'streamer', 'priority'];

function groupByCategory(rows) {
  const grouped = { drop: [], streamer: [], priority: [] };
  for (const row of rows) grouped[row.category]?.push(row);
  return grouped;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const creator_id = searchParams.get('creator_id');
  const weekParam = searchParams.get('week');
  const category = searchParams.get('category');
  const week = weekParam ? parseInt(weekParam, 10) : null;

  const selectCols = 'id, creator_id, week, category, player_id, term, faab_pct, rank, players(name, position, team, espn_id, sleeper_id)';

  if (creator_id && week && category) {
    if (!CATEGORIES.includes(category)) return Response.json({ error: 'Invalid category' }, { status: 400 });
    const { data, error } = await supabase()
      .from('waiver_wire_entries')
      .select(selectCols)
      .eq('creator_id', creator_id)
      .eq('week', week)
      .eq('category', category)
      .order('rank');
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ entries: data || [] });
  }

  if (creator_id && week) {
    const { data, error } = await supabase()
      .from('waiver_wire_entries')
      .select(selectCols)
      .eq('creator_id', creator_id)
      .eq('week', week)
      .order('rank');
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(groupByCategory(data || []));
  }

  if (week) {
    const { data, error } = await supabase()
      .from('waiver_wire_entries')
      .select(selectCols)
      .eq('week', week)
      .order('rank');
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const byCreator = {};
    for (const row of (data || [])) {
      if (!byCreator[row.creator_id]) byCreator[row.creator_id] = { drop: [], streamer: [], priority: [] };
      byCreator[row.creator_id][row.category].push(row);
    }
    return Response.json({ creators: byCreator });
  }

  return Response.json({ error: 'Missing required params: week, and creator_id and/or category' }, { status: 400 });
}

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { creator_id, category, entries } = body;
  const week = parseInt(body.week, 10);

  if (!creator_id || !Number.isInteger(week) || week < 1 || !CATEGORIES.includes(category)) {
    return Response.json({ error: 'creator_id, a valid week, and a valid category are required' }, { status: 400 });
  }
  if (!Array.isArray(entries)) {
    return Response.json({ error: 'entries must be an array' }, { status: 400 });
  }
  for (const e of entries) {
    if (!Number.isInteger(Number(e.player_id))) {
      return Response.json({ error: 'each entry needs a player_id' }, { status: 400 });
    }
    if (e.term !== undefined && e.term !== null && e.term !== 'short' && e.term !== 'long') {
      return Response.json({ error: "term must be 'short', 'long', or null" }, { status: 400 });
    }
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
    .from('waiver_wire_entries')
    .delete()
    .eq('creator_id', creator_id)
    .eq('week', week)
    .eq('category', category);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

  if (entries.length > 0) {
    const rows = entries.map((e, i) => ({
      creator_id,
      week,
      category,
      player_id: Number(e.player_id),
      term: e.term || null,
      faab_pct: e.faab_pct === null || e.faab_pct === '' || e.faab_pct === undefined ? null : Number(e.faab_pct),
      rank: i + 1,
      updated_at: new Date().toISOString(),
    }));
    const { error: insertError } = await supabase().from('waiver_wire_entries').insert(rows);
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
