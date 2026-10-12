import { createClient } from '@supabase/supabase-js';
import { fetchStripeChargeTotal, monthRange, ytdRange } from '@/lib/stripeRevenue';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// Real historical revenue, pulled from Stripe's actual charge history — the
// app has no historical record of its own (subscriptions only ever reflects
// *current* state), so this is the only accurate source for past months.
// Note: this returns platform-wide totals only. Per-creator/platform splits
// depend on which plan/creator each subscriber was on at the time, which
// isn't tracked historically anywhere — checked both Stripe's charge/
// subscription metadata (empty on every record; the checkout flow never
// attaches referral_creator_id to anything Stripe-side) and the app's own
// subscriptions table (only ever holds *current* state, no history) — so
// that breakdown stays live-only, computed from the current subscriptions
// table as it already was before this endpoint existed. (A monthly snapshot
// of the per-creator split is now saved to the `payouts` table instead — see
// lib/payoutCalc.js and app/api/cron/snapshot-payouts/route.js.)
export async function GET(request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase().auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: prof } = await supabase().from('profiles').select('role, is_creator').eq('id', user.id).maybeSingle();
  if (prof?.role !== 'admin' && !prof?.is_creator) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!process.env.STRIPE_REPORTING_KEY) {
    return Response.json({ error: 'STRIPE_REPORTING_KEY not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period'); // "YYYY-MM" or "ytd"
  if (!period) return Response.json({ error: 'period is required' }, { status: 400 });

  const { start, end, label } = period === 'ytd' ? ytdRange() : monthRange(period);

  try {
    const { usd, cad, chargeCount } = await fetchStripeChargeTotal(start, end);
    return Response.json({ period, label, usd, cad, chargeCount, source: 'stripe' });
  } catch (err) {
    console.error('[/api/admin/revenue] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
