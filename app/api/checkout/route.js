import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { isPromoActive } from '@/lib/promo';

let _stripe, _supabase;
const stripe = () => (_stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY));
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function POST(request) {
  const { referralCode, trialOffer } = await request.json();
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  let userId = null;
  if (token) {
    const { data: { user } } = await supabase().auth.getUser(token);
    userId = user?.id;
  }
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The expiring-trial reminder popup offers the same one-time promo pricing
  // outside the original calendar window — only to legacy no-card trial
  // users it actually applies to, verified server-side so the discount
  // can't just be requested by anyone.
  let trialOfferEligible = false;
  if (trialOffer) {
    const { data: sub } = await supabase()
      .from('subscriptions')
      .select('plan_type, status, stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();
    trialOfferEligible = sub?.plan_type === 'free_trial' && sub?.status === 'active' && !sub?.stripe_customer_id;
    if (!trialOfferEligible) {
      return Response.json({ error: 'This offer is not available for your account.' }, { status: 403 });
    }
  }

  let referralCreatorId = null;
  const trimmedCode = (referralCode || '').trim();
  if (trimmedCode) {
    const { data: activeCreators, error } = await supabase()
      .from('profiles')
      .select('creator_id, referral_code')
      .eq('is_creator', true)
      .not('creator_id', 'is', null);

    if (error) {
      console.error('[/api/checkout] active creators lookup failed:', error);
      return Response.json({ error: 'Something went wrong validating your code. Please try again.' }, { status: 500 });
    }

    const match = (activeCreators || []).find(
      (c) => c.referral_code && c.referral_code.toLowerCase() === trimmedCode.toLowerCase()
    );

    if (match) {
      referralCreatorId = match.creator_id;
    } else {
      // Fallback: a creator can have more than one code via
      // referral_code_aliases (profiles.referral_code only holds one).
      // Still only accepted if it points at a currently-active creator.
      const { data: alias, error: aliasError } = await supabase()
        .from('referral_code_aliases')
        .select('creator_id')
        .ilike('code', trimmedCode)
        .maybeSingle();
      if (aliasError) {
        console.error('[/api/checkout] referral alias lookup failed:', aliasError);
        return Response.json({ error: 'Something went wrong validating your code. Please try again.' }, { status: 500 });
      }
      const aliasIsActive = alias && (activeCreators || []).some((c) => c.creator_id === alias.creator_id);
      if (!aliasIsActive) {
        return Response.json(
          { error: "That code doesn't match any active creator. Double-check it or leave the field blank." },
          { status: 400 }
        );
      }
      referralCreatorId = alias.creator_id;
    }
  }

  // August promo: $10 one-time for 5 months instead of $10/month recurring.
  // Auto-applies to everyone until the cutoff — no code required. The same
  // pricing also applies outside that window for an eligible trialOffer request.
  const promoActive = isPromoActive() || trialOfferEligible;

  // Session metadata alone doesn't propagate to the recurring charges a
  // subscription generates later, or to the charge behind a one-time payment
  // — so without also setting subscription_data/payment_intent_data, every
  // future revenue report would have the exact same "no creator attribution"
  // gap as historical data does today. subscription_data.metadata lands on
  // the Subscription (readable via invoice.subscription on any future
  // recurring charge); payment_intent_data.metadata lands directly on the
  // one-time Charge itself.
  const attributionMetadata = {
    user_id: userId,
    plan_type: promoActive ? 'promo_5mo' : 'flat_access',
    referral_creator_id: referralCreatorId || '',
  };

  let session;
  try {
    session = await stripe().checkout.sessions.create({
      payment_method_types: ['card'],
      ...(promoActive
        ? {
            mode: 'payment',
            line_items: [{
              price_data: {
                currency: 'usd',
                unit_amount: 1000,
                product_data: {
                  name: 'Full Access — August Promo (5 months)',
                  description: 'One-time payment for 5 months of full access to all rankings and creator communities.',
                },
              },
              quantity: 1,
            }],
            payment_intent_data: { metadata: attributionMetadata },
          }
        : {
            mode: 'subscription',
            line_items: [{ price: 'price_1TrMBuA2rwv8VsfE9AOhxBis', quantity: 1 }],
            subscription_data: { metadata: attributionMetadata },
          }),
      allow_promotion_codes: true,
      metadata: attributionMetadata,
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/subscribe`,
    });
  } catch (err) {
    console.error('[/api/checkout] Stripe session creation failed:', err.message);
    return Response.json({ error: 'Something went wrong starting checkout. Please try again.' }, { status: 500 });
  }

  return Response.json({ url: session.url });
}