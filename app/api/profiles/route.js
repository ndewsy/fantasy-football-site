import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function GET(request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: prof } = await supabase()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (prof?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase()
    .from('profiles')
    .select('*')
    .order('role');

  if (error) {
    console.error('[/api/profiles] fetch failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ profiles: data || [] });
}

export async function PATCH(request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: prof } = await supabase()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (prof?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { profileId, referral_code } = await request.json();
  if (!profileId) {
    return Response.json({ error: 'Missing profileId' }, { status: 400 });
  }

  const normalized = (referral_code || '').trim();

  const { data, error } = await supabase()
    .from('profiles')
    .update({ referral_code: normalized || null })
    .eq('id', profileId)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'That code is already in use by another creator.' }, { status: 409 });
    }
    console.error('[/api/profiles PATCH] update failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ profile: data });
}
