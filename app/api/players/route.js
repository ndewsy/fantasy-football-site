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
