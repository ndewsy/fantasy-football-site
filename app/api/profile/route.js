import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  // Only update fields explicitly included in the request body.
  // Callers that send only { logo_url } won't accidentally null out other fields.
  const update = {};
  if ('display_name'  in body) update.display_name  = body.display_name  || null;
  if ('handle'        in body) update.handle        = body.handle        || null;
  if ('bio'           in body) update.bio           = body.bio           || null;
  if ('announcement'  in body) update.announcement  = body.announcement  || null;
  if ('logo_url'      in body) update.logo_url      = body.logo_url      || null;

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { error } = await supabase()
    .from('profiles')
    .update(update)
    .eq('id', user.id);

  if (error) {
    console.error('[/api/profile] update failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
