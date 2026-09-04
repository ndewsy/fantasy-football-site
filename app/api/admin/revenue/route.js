import { createClient } from '@supabase/supabase-js';

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
// table as it already was before this endpoint existed.
//
// This account settles in CAD, so balance_transaction.fee/net come back in
// CAD cents even though charge.amount is in USD cents. Converting each fee
// back to USD using that specific transaction's own exchange_rate (rather
// than a separate/approximate rate) keeps gross/fees/net all comparable in
// the same currency the rest of the UI already reports in.
async function fetchStripeChargeTotal(gte, lt) {
  let grossCents = 0;
  let feeUsdCents = 0;
  let count = 0;
  let startingAfter;
  for (;;) {
    const params = new URLSearchParams({
      limit: '100',
      'created[gte]': String(gte),
      'created[lt]': String(lt),
      'expand[]': 'data.balance_transaction',
    });
    if (startingAfter) params.set('starting_after', startingAfter);

    const res = await fetch(`https://api.stripe.com/v1/charges?${params.toString()}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_REPORTING_KEY}` },
    });
    if (!res.ok) throw new Error(`Stripe charges fetch failed: ${res.status} ${await res.text()}`);
    const body = await res.json();

    for (const c of body.data) {
      if (c.status === 'succeeded' && !c.refunded) {
        grossCents += c.amount - (c.amount_refunded || 0);
        count++;
        const bt = c.balance_transaction;
        if (bt && typeof bt === 'object' && bt.fee != null) {
          const rate = bt.exchange_rate || 1;
          feeUsdCents += bt.fee / rate;
        }
      }
    }

    if (!body.has_more || body.data.length === 0) break;
    startingAfter = body.data[body.data.length - 1].id;
  }
  const totalRevenue = grossCents / 100;
  const stripeFees = Math.round(feeUsdCents) / 100;
  return { totalRevenue, stripeFees, netRevenue: Math.round((grossCents - feeUsdCents)) / 100, chargeCount: count };
}

function monthRange(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const start = Date.UTC(y, m - 1, 1) / 1000;
  const end = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) / 1000;
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start, end, label };
}

function ytdRange() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 1) / 1000;
  const end = Math.floor(Date.now() / 1000);
  return { start, end, label: `${now.getUTCFullYear()} Year to Date` };
}

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
    const { totalRevenue, stripeFees, netRevenue, chargeCount } = await fetchStripeChargeTotal(start, end);
    return Response.json({ period, label, totalRevenue, stripeFees, netRevenue, chargeCount, source: 'stripe' });
  } catch (err) {
    console.error('[/api/admin/revenue] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
