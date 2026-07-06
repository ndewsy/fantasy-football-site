import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return new Response("Unauthorized", { status: 401 });

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  console.log("[/api/portal] subscription row:", sub);

  if (!sub?.stripe_customer_id) {
    console.warn("[/api/portal] No stripe_customer_id for user:", user.id);
    return Response.json({ error: "No Stripe customer ID found for this account. Contact support." }, { status: 404 });
  }

  let session;
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/account`,
    });
  } catch (err) {
    console.error("[/api/portal] Stripe error:", err.message, err);
    return Response.json({ error: err.message }, { status: 500 });
  }

  return Response.json({ url: session.url });
}
