// Shared by app/api/admin/revenue/route.js (live "pick a period" UI) and
// lib/payoutCalc.js (the monthly payout snapshot) — both need the exact same
// real gross/fees/net numbers for a given month, pulled from Stripe's actual
// charge history rather than estimated, since the app itself has no
// historical revenue record of its own.
//
// This account settles in CAD, so balance_transaction.amount/fee/net come
// back natively in CAD cents even though charge.amount is in USD cents (what
// customers actually paid). Two consistent views come out of that:
//   - USD: charge.amount as gross, with each transaction's fee converted
//     back to USD using *that transaction's own* exchange_rate (not a
//     separate/approximate rate) so gross/fees/net are all comparable.
//   - CAD: balance_transaction.amount/fee/net used directly, no conversion
//     at all — this is exactly what Stripe calculated and actually pays out.
export async function fetchStripeChargeTotal(gte, lt) {
  let grossUsdCents = 0;
  let feeUsdCents = 0;
  let grossCadCents = 0;
  let feeCadCents = 0;
  let netCadCents = 0;
  let settlementCurrency = null;
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
        grossUsdCents += c.amount - (c.amount_refunded || 0);
        count++;
        const bt = c.balance_transaction;
        if (bt && typeof bt === 'object' && bt.fee != null) {
          const rate = bt.exchange_rate || 1;
          feeUsdCents += bt.fee / rate;
          grossCadCents += bt.amount;
          feeCadCents += bt.fee;
          netCadCents += bt.net;
          settlementCurrency = bt.currency;
        }
      }
    }

    if (!body.has_more || body.data.length === 0) break;
    startingAfter = body.data[body.data.length - 1].id;
  }
  return {
    chargeCount: count,
    usd: {
      totalRevenue: grossUsdCents / 100,
      stripeFees: Math.round(feeUsdCents) / 100,
      netRevenue: Math.round(grossUsdCents - feeUsdCents) / 100,
    },
    cad: {
      totalRevenue: grossCadCents / 100,
      stripeFees: feeCadCents / 100,
      netRevenue: netCadCents / 100,
      currency: settlementCurrency,
    },
  };
}

export function monthRange(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const start = Date.UTC(y, m - 1, 1) / 1000;
  const end = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) / 1000;
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start, end, label };
}

export function ytdRange() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 1) / 1000;
  const end = Math.floor(Date.now() / 1000);
  return { start, end, label: `${now.getUTCFullYear()} Year to Date` };
}
