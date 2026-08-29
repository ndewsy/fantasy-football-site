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
    .select('role, is_creator')
    .eq('id', user.id)
    .maybeSingle();

  if (prof?.role !== 'admin' && !prof?.is_creator) {
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

  // auth.users is the source of truth for "every user" — there's no profiles row
  // for most accounts (nothing in this app creates one on signup), so building the
  // list from `profiles` would silently drop everyone without one. Pull the full
  // user list from the Admin API instead and left-join profiles/subscriptions onto it.
  const authUsers = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data: pageData, error: listError } = await supabase().auth.admin.listUsers({ page, perPage });
    if (listError) {
      console.error('[/api/admin/users] listUsers failed:', listError);
      return Response.json({ error: listError.message }, { status: 500 });
    }
    authUsers.push(...pageData.users);
    if (pageData.users.length < perPage) break;
    page++;
  }

  const profileById = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  const subsByUserId = Object.fromEntries((subscriptions || []).map(s => [s.user_id, s]));

  const users = authUsers
    .map(u => {
      const p = profileById[u.id];
      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        display_name: p?.display_name || null,
        role: p?.role || 'subscriber',
        is_creator: p?.is_creator || false,
        creator_id: p?.creator_id || null,
        subscription: subsByUserId[u.id] || null,
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return Response.json({ users });
}
