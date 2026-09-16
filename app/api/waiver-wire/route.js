import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

const CATEGORIES = ['drop', 'streamer', 'priority'];
const POSITIONS = ['QB', 'FLEX', 'TE', 'K', 'DST'];
// Only Streamers is split into position tabs — Drop/Cut and Priority Adds
// are both single flat lists. Term/FAAB stays a separate concept from
// position tabs (Priority Adds still uses them, just without a position
// split), so it's keyed off its own set rather than reusing this one.
const POSITIONAL_CATEGORIES = new Set(['streamer']);
const TERM_FAAB_CATEGORIES = new Set(['priority', 'streamer']);

function emptyPositionMap() {
  return Object.fromEntries(POSITIONS.map((p) => [p, []]));
}

function groupByPosition(rows) {
  const grouped = emptyPositionMap();
  for (const row of rows) grouped[row.position]?.push(row);
  return grouped;
}

// { drop: [...], priority: [...], streamer: {QB:[],FLEX:[],...} } — shape
// per category depends on POSITIONAL_CATEGORIES rather than hardcoding which
// ones are flat, so this and the per-creator grouping below (week-only GET)
// automatically follow whatever's in that set.
function groupByCategoryAndPosition(rows) {
  const grouped = {};
  for (const cat of CATEGORIES) grouped[cat] = POSITIONAL_CATEGORIES.has(cat) ? emptyPositionMap() : [];
  for (const row of rows) {
    if (POSITIONAL_CATEGORIES.has(row.category)) grouped[row.category][row.position]?.push(row);
    else grouped[row.category].push(row);
  }
  return grouped;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const creator_id = searchParams.get('creator_id');
  const weekParam = searchParams.get('week');
  const category = searchParams.get('category');
  const position = searchParams.get('position');
  const playerIdParam = searchParams.get('player_id');
  const week = weekParam ? parseInt(weekParam, 10) : null;

  const selectCols = 'id, creator_id, week, category, position, player_id, term, faab_pct, rank, updated_at, players(name, position, team, espn_id, sleeper_id, percent_rostered)';

  // One player, across every creator — powers the player card's "waiver
  // wire mentions" section rather than a single creator's board.
  if (playerIdParam) {
    const playerId = parseInt(playerIdParam, 10);
    if (!Number.isInteger(playerId)) return Response.json({ error: 'Invalid player_id' }, { status: 400 });
    let query = supabase().from('waiver_wire_entries').select(selectCols).eq('player_id', playerId);
    if (week) query = query.eq('week', week);
    const { data, error } = await query.order('week', { ascending: false }).order('rank');
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ entries: data || [] });
  }

  if (creator_id && week && category) {
    if (!CATEGORIES.includes(category)) return Response.json({ error: 'Invalid category' }, { status: 400 });
    if (position && !POSITIONS.includes(position)) return Response.json({ error: 'Invalid position' }, { status: 400 });
    let query = supabase()
      .from('waiver_wire_entries')
      .select(selectCols)
      .eq('creator_id', creator_id)
      .eq('week', week)
      .eq('category', category);
    if (position) query = query.eq('position', position);
    const { data, error } = await query.order('rank');
    if (error) return Response.json({ error: error.message }, { status: 500 });
    // No position given for a positional category — return the full
    // position breakdown; otherwise (drop, or a specific position) flat.
    if (POSITIONAL_CATEGORIES.has(category) && !position) {
      return Response.json({ positions: groupByPosition(data || []) });
    }
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
    return Response.json(groupByCategoryAndPosition(data || []));
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
      if (!byCreator[row.creator_id]) {
        byCreator[row.creator_id] = {};
        for (const cat of CATEGORIES) byCreator[row.creator_id][cat] = POSITIONAL_CATEGORIES.has(cat) ? emptyPositionMap() : [];
      }
      if (POSITIONAL_CATEGORIES.has(row.category)) byCreator[row.creator_id][row.category][row.position]?.push(row);
      else byCreator[row.creator_id][row.category].push(row);
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
  const isPositional = POSITIONAL_CATEGORIES.has(category);
  const allowsTermFaab = TERM_FAAB_CATEGORIES.has(category);
  const position = isPositional ? body.position : null;

  if (!creator_id || !Number.isInteger(week) || week < 1 || !CATEGORIES.includes(category)) {
    return Response.json({ error: 'creator_id, a valid week, and a valid category are required' }, { status: 400 });
  }
  if (isPositional && !POSITIONS.includes(position)) {
    return Response.json({ error: 'a valid position is required for this category' }, { status: 400 });
  }
  if (!Array.isArray(entries)) {
    return Response.json({ error: 'entries must be an array' }, { status: 400 });
  }
  for (const e of entries) {
    if (!Number.isInteger(Number(e.player_id))) {
      return Response.json({ error: 'each entry needs a player_id' }, { status: 400 });
    }
    if (allowsTermFaab && e.term !== undefined && e.term !== null && e.term !== 'short' && e.term !== 'long') {
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

  let deleteQuery = supabase()
    .from('waiver_wire_entries')
    .delete()
    .eq('creator_id', creator_id)
    .eq('week', week)
    .eq('category', category);
  deleteQuery = position ? deleteQuery.eq('position', position) : deleteQuery.is('position', null);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

  if (entries.length > 0) {
    const rows = entries.map((e, i) => ({
      creator_id,
      week,
      category,
      position,
      player_id: Number(e.player_id),
      term: allowsTermFaab ? (e.term || null) : null,
      faab_pct: allowsTermFaab ? (e.faab_pct === null || e.faab_pct === '' || e.faab_pct === undefined ? null : Number(e.faab_pct)) : null,
      rank: i + 1,
      updated_at: new Date().toISOString(),
    }));
    const { error: insertError } = await supabase().from('waiver_wire_entries').insert(rows);
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
