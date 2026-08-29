import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

async function requireAdmin(request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabase().auth.getUser(token);
  if (error || !user) return null;
  const { data: prof } = await supabase().from('profiles').select('role').eq('id', user.id).maybeSingle();
  return prof?.role === 'admin' ? user : null;
}

// Risk ratings are settable by creators too, not just admins — unlike adding
// new players, which stays admin-only.
async function requireAdminOrCreator(request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabase().auth.getUser(token);
  if (error || !user) return null;
  const { data: prof } = await supabase().from('profiles').select('role, is_creator').eq('id', user.id).maybeSingle();
  return (prof?.role === 'admin' || prof?.is_creator) ? user : null;
}

export async function POST(request) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { name, position, team } = await request.json();
  if (!name?.trim() || !position || !team?.trim()) {
    return Response.json({ error: 'name, position, and team are required' }, { status: 400 });
  }

  const { data, error } = await supabase()
    .from('players')
    .insert({ name: name.trim(), position, team: team.trim().toUpperCase() })
    .select('id')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, id: data.id });
}

export async function PATCH(request) {
  const user = await requireAdminOrCreator(request);
  if (!user) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { id, risk_rating } = await request.json();
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  const value = risk_rating === null ? null : Number(risk_rating);
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > 10)) {
    return Response.json({ error: 'risk_rating must be an integer 1-10 or null' }, { status: 400 });
  }

  const { error } = await supabase()
    .from('players')
    .update({ risk_rating: value })
    .eq('id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
