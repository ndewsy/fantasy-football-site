import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await request.json();
  const expected = process.env.FREE_TRIAL_PROMO_CODE;
  if (!expected || (code || '').trim().toUpperCase() !== expected.trim().toUpperCase()) {
    return Response.json({ error: 'That code is not valid.' }, { status: 400 });
  }

  const { data: existing } = await supabase()
    .from('subscriptions')
    .select('status, plan_type')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing?.status === 'active' && existing.plan_type !== 'free_trial') {
    return Response.json({ error: 'You already have an active subscription.' }, { status: 400 });
  }

  const trialEndsAt = new Date();
  trialEndsAt.setMonth(trialEndsAt.getMonth() + 1);

  const { error } = await supabase().from('subscriptions').upsert(
    {
      user_id: user.id,
      status: 'active',
      plan_type: 'free_trial',
      trial_ends_at: trialEndsAt.toISOString(),
      stripe_customer_id: null,
      included_creator: null,
      add_on_creators: [],
      referral_creator_id: null,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.error('[/api/redeem-code] upsert failed:', error);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return Response.json({ ok: true, trial_ends_at: trialEndsAt.toISOString() });
}
