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

  const [{ data: profiles, error: profilesError }, { data: subscriptions, error: subsError }] = await Promise.all([
    supabase().from('profiles').select('id, display_name, role, is_creator, creator_id'),
    supabase().from('subscriptions').select('user_id, status, plan_type, trial_ends_at, created_at'),
  ]);

  if (profilesError || subsError) {
    console.error('[/api/admin/users] fetch failed:', profilesError || subsError);
    return Response.json({ error: (profilesError || subsError).message }, { status: 500 });
  }

  // Emails live in auth.users, not queryable via the regular client — pull them
  // through the Admin API instead, paginating in case the user base grows past
  // a single page.
  const emailById = {};
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data: pageData, error: listError } = await supabase().auth.admin.listUsers({ page, perPage });
    if (listError) {
      console.error('[/api/admin/users] listUsers failed:', listError);
      break;
    }
    for (const u of pageData.users) emailById[u.id] = u.email;
    if (pageData.users.length < perPage) break;
    page++;
  }

  const subsByUserId = Object.fromEntries((subscriptions || []).map(s => [s.user_id, s]));

  const users = (profiles || []).map(p => ({
    id: p.id,
    display_name: p.display_name,
    email: emailById[p.id] || null,
    role: p.role,
    is_creator: p.is_creator,
    creator_id: p.creator_id,
    subscription: subsByUserId[p.id] || null,
  }));

  return Response.json({ users });
}
