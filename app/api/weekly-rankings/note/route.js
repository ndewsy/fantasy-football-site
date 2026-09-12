import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

const MAX_NOTE_LENGTH = 500;

// Week-level (not per-position) so it's a separate small resource from the
// entries/tiers endpoints above, which both require a valid position.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const creator_id = searchParams.get('creator_id');
  const week = parseInt(searchParams.get('week'), 10);

  if (!creator_id || !Number.isInteger(week) || week < 1) {
    return Response.json({ error: 'creator_id and a valid week are required' }, { status: 400 });
  }

  const { data, error } = await supabase()
    .from('weekly_rankings_notes')
    .select('note')
    .eq('creator_id', creator_id)
    .eq('week', week)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ note: data?.note || '' });
}

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { creator_id } = body;
  const week = parseInt(body.week, 10);
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  if (!creator_id || !Number.isInteger(week) || week < 1) {
    return Response.json({ error: 'creator_id and a valid week are required' }, { status: 400 });
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return Response.json({ error: `note must be ${MAX_NOTE_LENGTH} characters or fewer` }, { status: 400 });
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

  const { error } = await supabase()
    .from('weekly_rankings_notes')
    .upsert(
      { creator_id, week, note, updated_at: new Date().toISOString() },
      { onConflict: 'creator_id,week' }
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
