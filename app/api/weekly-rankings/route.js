import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'];

function emptyPositionMap() {
  return Object.fromEntries(POSITIONS.map((p) => [p, []]));
}

function groupByPosition(rows) {
  const grouped = emptyPositionMap();
  for (const row of rows) grouped[row.position]?.push(row);
  return grouped;
}

function emptyTiersMap() {
  return Object.fromEntries(POSITIONS.map((p) => [p, []]));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const creator_id = searchParams.get('creator_id');
  const weekParam = searchParams.get('week');
  const week = weekParam ? parseInt(weekParam, 10) : null;

  if (!creator_id) {
    return Response.json({ error: 'creator_id is required' }, { status: 400 });
  }

  const selectCols = 'id, creator_id, week, position, player_id, rank, players(name, position, team, espn_id, sleeper_id)';

  if (week) {
    const [{ data, error }, { data: tierRows, error: tierError }, { data: noteRow, error: noteError }] = await Promise.all([
      supabase().from('weekly_rankings').select(selectCols).eq('creator_id', creator_id).eq('week', week).order('rank'),
      supabase().from('weekly_ranking_tiers').select('position, tiers').eq('creator_id', creator_id).eq('week', week),
      supabase().from('weekly_rankings_notes').select('note').eq('creator_id', creator_id).eq('week', week).maybeSingle(),
    ]);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (tierError) return Response.json({ error: tierError.message }, { status: 500 });
    if (noteError) return Response.json({ error: noteError.message }, { status: 500 });
    const tiers = emptyTiersMap();
    for (const row of tierRows || []) tiers[row.position] = row.tiers || [];
    return Response.json({ positions: groupByPosition(data || []), tiers, note: noteRow?.note || '' });
  }

  // No week — every week this creator has published, in one response, since
  // the whole season is only a few hundred rows at most (public page uses
  // this to build its week selector without a request per week).
  const [{ data, error }, { data: tierRows, error: tierError }, { data: noteRows, error: noteError }] = await Promise.all([
    supabase().from('weekly_rankings').select(selectCols).eq('creator_id', creator_id).order('week').order('rank'),
    supabase().from('weekly_ranking_tiers').select('week, position, tiers').eq('creator_id', creator_id),
    supabase().from('weekly_rankings_notes').select('week, note').eq('creator_id', creator_id),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (tierError) return Response.json({ error: tierError.message }, { status: 500 });
  if (noteError) return Response.json({ error: noteError.message }, { status: 500 });

  const weeks = {};
  for (const row of data || []) {
    const key = String(row.week);
    if (!weeks[key]) weeks[key] = emptyPositionMap();
    weeks[key][row.position]?.push(row);
  }
  const tiers = {};
  for (const row of tierRows || []) {
    const key = String(row.week);
    if (!tiers[key]) tiers[key] = emptyTiersMap();
    tiers[key][row.position] = row.tiers || [];
  }
  const notes = {};
  for (const row of noteRows || []) {
    if (row.note) notes[String(row.week)] = row.note;
  }
  return Response.json({ weeks, tiers, notes });
}

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { creator_id, position, entries, tiers } = body;
  const week = parseInt(body.week, 10);

  if (!creator_id || !Number.isInteger(week) || week < 1 || !POSITIONS.includes(position)) {
    return Response.json({ error: 'creator_id, a valid week, and a valid position are required' }, { status: 400 });
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
    .from('weekly_rankings')
    .delete()
    .eq('creator_id', creator_id)
    .eq('week', week)
    .eq('position', position);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

  if (entries.length > 0) {
    const rows = entries.map((e, i) => ({
      creator_id,
      week,
      position,
      player_id: Number(e.player_id),
      rank: i + 1,
      updated_at: new Date().toISOString(),
    }));
    const { error: insertError } = await supabase().from('weekly_rankings').insert(rows);
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
  }

  if (tiers !== undefined) {
    const { error: tiersError } = await supabase()
      .from('weekly_ranking_tiers')
      .upsert(
        { creator_id, week, position, tiers, updated_at: new Date().toISOString() },
        { onConflict: 'creator_id,week,position' }
      );
    if (tiersError) return Response.json({ error: tiersError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
