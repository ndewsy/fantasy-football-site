import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response('Webhook error', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    if (userId) {
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        status: 'active',
        stripe_customer_id: session.customer,
        included_creator: session.metadata?.included_creator || null,
        add_on_creators: session.metadata?.add_ons
          ? session.metadata.add_ons.split(',').filter(Boolean)
          : [],
      });
    }
  }

  return new Response('OK', { status: 200 });
}