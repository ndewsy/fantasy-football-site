import { createClient } from '@supabase/supabase-js';
import { getAuthedUser } from '@/lib/getUser';
import { getStartSitAccess } from '@/lib/startSitAccess';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

const MONTHLY_LIMIT = 3;

// Read-only check of the current month's voucher usage — used to render the
// "X of 3 left" badge / locked state without spending a voucher just to look.
export async function GET(request) {
  const authed = await getAuthedUser(request);
  if (!authed) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { isSubscribed } = await getStartSitAccess(supabase(), authed.user.id);
  if (isSubscribed) {
    return Response.json({ isSubscribed: true, limit: null, used: 0, remaining: null });
  }

  const yearMonth = new Date().toISOString().slice(0, 7);
  const { data, error } = await supabase()
    .from('start_sit_usage')
    .select('used_count')
    .eq('user_id', authed.user.id)
    .eq('year_month', yearMonth)
    .maybeSingle();

  if (error) {
    console.error('[/api/start-sit/usage] fetch failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const used = data?.used_count || 0;
  return Response.json({ isSubscribed: false, limit: MONTHLY_LIMIT, used, remaining: Math.max(0, MONTHLY_LIMIT - used) });
}
