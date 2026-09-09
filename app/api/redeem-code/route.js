import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

let _stripe, _supabase;
const stripe = () => (_stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY));
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

  // A real Stripe subscription with a trial period — collects a card now so
  // it can auto-convert to standard $10/mo billing when the trial ends,
  // instead of the old no-card grant that just expired with nothing to renew.
  const session = await stripe().checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: 'price_1TrMBuA2rwv8VsfE9AOhxBis', quantity: 1 }],
    subscription_data: {
      trial_period_days: 30,
      metadata: { user_id: user.id, plan_type: 'free_trial' },
    },
    metadata: { user_id: user.id, plan_type: 'free_trial' },
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/subscribe`,
  });

  return Response.json({ url: session.url });
}
