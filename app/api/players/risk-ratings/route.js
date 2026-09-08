import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// Public read, same convention as /api/rankings GET — visibility is enforced
// by the frontend's free-row gating, not the API.
export async function GET() {
  const { data, error } = await supabase()
    .from('player_risk_ratings')
    .select('creator_id, player_id, risk_rating');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ratings: data || [] });
}

export async function PATCH(request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { creator_id, player_id, risk_rating } = await request.json();
  if (!creator_id || !player_id) {
    return Response.json({ error: 'creator_id and player_id are required' }, { status: 400 });
  }

  const value = risk_rating === null ? null : Number(risk_rating);
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > 10)) {
    return Response.json({ error: 'risk_rating must be an integer 1-10 or null' }, { status: 400 });
  }

  const { data: prof } = await supabase()
    .from('profiles')
    .select('role, is_creator, creator_id')
    .eq('id', user.id)
    .maybeSingle();

  // Admins can edit any creator's rating; a creator may only edit their own.
  const isAdmin = prof?.role === 'admin';
  if (!isAdmin && !(prof?.is_creator && prof.creator_id === creator_id)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (value === null) {
    const { error } = await supabase()
      .from('player_risk_ratings')
      .delete()
      .eq('creator_id', creator_id)
      .eq('player_id', player_id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  const { error } = await supabase()
    .from('player_risk_ratings')
    .upsert(
      { creator_id, player_id, risk_rating: value, updated_at: new Date().toISOString() },
      { onConflict: 'creator_id,player_id' }
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
