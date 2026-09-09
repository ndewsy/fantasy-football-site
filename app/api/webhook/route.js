import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

let _stripe, _supabase;
const stripe = () => (_stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY));
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function POST(request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response('Webhook error', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    if (userId) {
      const referralCreatorId = session.metadata?.referral_creator_id || null;

      if (session.metadata?.plan_type === 'promo_5mo') {
        // August promo: one-time $10 payment, 5 months of access, no recurring billing.
        const trialEndsAt = new Date();
        trialEndsAt.setMonth(trialEndsAt.getMonth() + 5);
        await supabase().from('subscriptions').upsert(
          {
            user_id: userId,
            status: 'active',
            stripe_customer_id: session.customer || null,
            plan_type: 'promo_5mo',
            trial_ends_at: trialEndsAt.toISOString(),
            referral_creator_id: referralCreatorId,
            included_creator: null,
            add_on_creators: [],
          },
          { onConflict: 'user_id' }
        );
      } else if (session.metadata?.plan_type === 'free_trial') {
        // Real Stripe subscription with a trial period — read back its actual
        // trial_end rather than recomputing +30 days, so it can't drift from
        // what Stripe will actually act on when the trial converts to billing.
        const stripeSub = await stripe().subscriptions.retrieve(session.subscription);
        await supabase().from('subscriptions').upsert(
          {
            user_id: userId,
            status: 'active',
            stripe_customer_id: session.customer,
            plan_type: 'free_trial',
            trial_ends_at: new Date(stripeSub.trial_end * 1000).toISOString(),
            referral_creator_id: null,
            included_creator: null,
            add_on_creators: [],
          },
          { onConflict: 'user_id' }
        );
      } else {
        const planType = session.metadata?.plan_type === 'flat_access' ? 'flat_access' : 'legacy';
        await supabase().from('subscriptions').upsert(
          {
            user_id: userId,
            status: 'active',
            stripe_customer_id: session.customer,
            plan_type: planType,
            referral_creator_id: planType === 'flat_access' ? referralCreatorId : null,
            included_creator: planType === 'flat_access' ? null : (session.metadata?.included_creator || null),
            add_on_creators: planType === 'flat_access'
              ? []
              : (session.metadata?.add_ons ? session.metadata.add_ons.split(',').filter(Boolean) : []),
          },
          { onConflict: 'user_id' }
        );
      }
    }
  }

  // Keeps subscriptions.status/plan_type in sync with what Stripe actually
  // has — previously nothing synced a cancellation, a failed payment, or
  // (for the new free-trial flow) Stripe's own trial-to-paid conversion, so
  // our table could silently drift from reality.
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object;
    if (sub.status === 'active' && sub.metadata?.plan_type === 'free_trial') {
      // Stripe's trial ended and billing kicked in on its own — from here
      // Stripe owns the lifecycle, so hand this off to a real plan_type and
      // clear trial_ends_at so expire-free-trials (which only ever targets
      // free_trial/promo_5mo rows) leaves it alone.
      await supabase().from('subscriptions')
        .update({ plan_type: 'legacy', trial_ends_at: null })
        .eq('stripe_customer_id', sub.customer);
    } else if (['canceled', 'unpaid', 'past_due'].includes(sub.status)) {
      await supabase().from('subscriptions')
        .update({ status: 'expired' })
        .eq('stripe_customer_id', sub.customer);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    await supabase().from('subscriptions')
      .update({ status: 'expired' })
      .eq('stripe_customer_id', sub.customer);
  }

  return new Response('OK', { status: 200 });
}