import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

let _stripe, _supabase;
const stripe = () => (_stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY));
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function POST(request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      console.warn('[/api/verify-checkout] No token in Authorization header');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase().auth.getUser(token);
    if (authError || !user) {
      console.warn('[/api/verify-checkout] Auth failed:', authError?.message);
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[/api/verify-checkout] Authenticated user:', user.id);

    let body;
    try {
      body = await request.json();
    } catch (err) {
      console.error('[/api/verify-checkout] Failed to parse request body:', err.message);
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { session_id } = body;
    if (!session_id) {
      console.warn('[/api/verify-checkout] Missing session_id in body');
      return Response.json({ error: 'Missing session_id' }, { status: 400 });
    }
    console.log('[/api/verify-checkout] Retrieving Stripe session:', session_id);

    let stripeSession;
    try {
      stripeSession = await stripe().checkout.sessions.retrieve(session_id);
    } catch (err) {
      console.error('[/api/verify-checkout] Stripe retrieve failed:', err.message);
      return Response.json({ error: 'Invalid session' }, { status: 400 });
    }

    console.log('[/api/verify-checkout] Stripe session:', {
      status: stripeSession.status,
      payment_status: stripeSession.payment_status,
      metadata: stripeSession.metadata,
    });

    // 'no_payment_required' is valid for subscriptions with a trial period
    const paymentOk =
      stripeSession.status === 'complete' &&
      (stripeSession.payment_status === 'paid' || stripeSession.payment_status === 'no_payment_required');
    if (!paymentOk) {
      console.warn('[/api/verify-checkout] Session not complete/paid:', {
        status: stripeSession.status,
        payment_status: stripeSession.payment_status,
      });
      return Response.json({ error: 'Payment not complete' }, { status: 402 });
    }

    const metaUserId = stripeSession.metadata?.user_id;
    if (!metaUserId || metaUserId !== user.id) {
      console.warn('[/api/verify-checkout] user_id mismatch:', {
        metaUserId,
        authUserId: user.id,
      });
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const includedCreator = stripeSession.metadata?.included_creator || '';
    const addOns = stripeSession.metadata?.add_ons
      ? stripeSession.metadata.add_ons.split(',').filter(Boolean)
      : [];

    const stripeCustomerId = stripeSession.customer || null;
    console.log('[/api/verify-checkout] Upserting subscription:', { user_id: user.id, includedCreator, addOns, stripeCustomerId });

    const { error } = await supabase().from('subscriptions').upsert(
      {
        user_id: user.id,
        status: 'active',
        stripe_customer_id: stripeCustomerId,
        included_creator: includedCreator,
        add_on_creators: addOns,
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.error('[/api/verify-checkout] upsert failed:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[/api/verify-checkout] Unhandled exception:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
