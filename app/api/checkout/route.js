import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

let _stripe, _supabase;
const stripe = () => (_stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY));
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

export async function POST(request) {
  const { includedCreator, addOns } = await request.json();
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  let userId = null;
  if (token) {
    const { data: { user } } = await supabase().auth.getUser(token);
    userId = user?.id;
  }

  const lineItems = [
    { price: 'price_1TrMBuA2rwv8VsfE9AOhxBis', quantity: 1 },
  ];

  for (let i = 0; i < addOns.length; i++) {
    lineItems.push({ price: 'price_1TrMBvA2rwv8VsfEI4KxfDsq', quantity: 1 });
  }

  const session = await stripe().checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'subscription',
    allow_promotion_codes: true,
    metadata: {
      user_id: userId,
      included_creator: includedCreator,
      add_ons: addOns.join(','),
    },
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/subscribe`,
  });

  return Response.json({ url: session.url });
}