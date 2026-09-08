// Server-side port of the isSubscribed/isDashboardUser logic in
// app/start-sit/page.js — both must agree, since the client renders the UI
// state but the server is the actual enforcement point.
export async function getStartSitAccess(supabase, userId) {
  const [{ data: sub }, { data: prof }, { data: activeCreators }] = await Promise.all([
    supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('profiles').select('role, is_creator').eq('id', userId).maybeSingle(),
    supabase.from('profiles').select('creator_id, referral_code').eq('is_creator', true).not('creator_id', 'is', null),
  ]);

  const isDashboardUser = !!(prof && (prof.role === 'admin' || prof.is_creator));
  const activeCreatorIds = (activeCreators || []).map((c) => c.creator_id);
  const isFlatAccessGranted = sub?.plan_type === 'flat_access' && sub?.status === 'active' && activeCreatorIds.length > 0;
  const isSubscribed = isDashboardUser
    || (!!sub && sub.plan_type !== 'flat_access' && sub.status === 'active')
    || isFlatAccessGranted;

  return { isSubscribed, isDashboardUser };
}
