import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase()
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('plan_type', 'free_trial')
    .eq('status', 'active')
    .lte('trial_ends_at', new Date().toISOString())
    .select('user_id');

  if (error) {
    console.error('[expire-free-trials] update failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  console.log(`[expire-free-trials] expired ${data?.length || 0} free trials`);
  return Response.json({ ok: true, expired: data?.length || 0 });
}
