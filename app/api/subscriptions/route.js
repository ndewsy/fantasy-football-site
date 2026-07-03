import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: prof } = await supabase
    .from('profiles')
    .select('role, is_creator')
    .eq('id', user.id)
    .maybeSingle();

  if (!prof || !(prof.role === 'admin' || prof.is_creator)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('status', 'active');

  if (error) {
    console.error('[/api/subscriptions] fetch failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ subscriptions: data || [] });
}
