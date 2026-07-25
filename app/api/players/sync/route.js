import { createClient } from '@supabase/supabase-js';
import { syncPlayers } from '../../../../lib/syncPlayers';

let _sb;
const sb = () => (_sb ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function POST(request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error } = await sb().auth.getUser(token);
  if (error || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: prof } = await sb()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (prof?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const result = await syncPlayers();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error('[players/sync]', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
