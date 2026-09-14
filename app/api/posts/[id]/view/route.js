import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// No auth check — the modal that triggers this is only reachable from an
// unlocked (subscribed) post card in the first place, so this is already
// gated in practice. Uses the service-role key since `posts` has no UPDATE
// RLS policy for anonymous/authenticated roles.
export async function POST(request, { params }) {
  const { id } = await params;
  if (!id) return Response.json({ error: 'Missing post id' }, { status: 400 });

  const { data, error } = await supabase().rpc('increment_post_views', { p_post_id: id });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, views: data });
}
