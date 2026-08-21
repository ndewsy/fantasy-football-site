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

  return new Response('OK', { status: 200 });
}