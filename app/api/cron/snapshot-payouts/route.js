import { createClient } from '@supabase/supabase-js';
import { computeMonthlyPayouts } from '@/lib/payoutCalc';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

function lastMonthPeriod() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Runs on the 1st of each month (see .github/workflows/snapshot-payouts.yml)
// and locks in last month's per-creator payout as a real row in `payouts` —
// the live dashboard only ever shows "whatever's active right now," so
// without this, last month's number is gone the moment the new month starts.
// Pass ?period=YYYY-MM to (re)compute a specific month instead (e.g. to
// backfill a month from before this existed).
// Never overwrites an existing row for that creator/period — once a row
// exists (paid or not), re-running this is a no-op for it, so a manually
// adjusted or already-paid amount is never silently reset.
export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || lastMonthPeriod();
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return Response.json({ error: 'period must be in YYYY-MM format' }, { status: 400 });
  }

  try {
    const { amounts } = await computeMonthlyPayouts(period);
    const rows = Object.entries(amounts)
      .filter(([, amount]) => amount > 0)
      .map(([creator_id, amount]) => ({ creator_id, period, amount, paid: false }));

    if (rows.length === 0) {
      return Response.json({ period, inserted: 0, amounts });
    }

    const { error } = await supabase()
      .from('payouts')
      .upsert(rows, { onConflict: 'creator_id,period', ignoreDuplicates: true });
    if (error) throw error;

    return Response.json({ period, inserted: rows.length, amounts });
  } catch (err) {
    console.error('[/api/cron/snapshot-payouts] failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
