import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

let _stripe, _supabase;
const stripe = () => (_stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY));
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function POST(request) {
  const { referralCode } = await request.json();
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

    if (!match) {
      return Response.json(
        { error: "That code doesn't match any active creator. Double-check it or leave the field blank." },
        { status: 400 }
      );
    }
    referralCreatorId = match.creator_id;
  }

  const session = await stripe().checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: 'price_1TrMBuA2rwv8VsfE9AOhxBis', quantity: 1 }],
    mode: 'subscription',
    allow_promotion_codes: true,
    metadata: {
      user_id: userId,
      plan_type: 'flat_access',
      referral_creator_id: referralCreatorId || '',
    },
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/subscribe`,
  });

  return Response.json({ url: session.url });
}