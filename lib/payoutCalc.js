import { createClient } from '@supabase/supabase-js';
import { fetchStripeChargeTotal, monthRange } from '@/lib/stripeRevenue';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// Mirrors the live per-creator breakdown math in app/dashboard/page.js
// (the "Revenue & Payouts" / "My Earnings" tabs) exactly, but for an
// arbitrary target period rather than always "right now" — this is what
// lets a month's numbers be locked in as a real row before the live
// dashboard moves on to the next month and the chance to compute them is
// gone. Same caveat as the live dashboard: `subscriptions` only has
// *current* status, not history, so a sub that was referral-coded to a
// creator in the target month but has since cancelled won't show up here
// either — this computes "what the live dashboard would have shown if you'd
// looked at the end of that month," not a perfect historical cohort.
export async function computeMonthlyPayouts(period) {
  const { data: profiles, error: profilesError } = await supabase()
    .from('profiles')
    .select('creator_id, is_creator')
    .eq('is_creator', true)
    .not('creator_id', 'is', null);
  if (profilesError) throw profilesError;
  const activeCreatorIds = (profiles || []).map((p) => p.creator_id);

  const { data: subs, error: subsError } = await supabase()
    .from('subscriptions')
    .select('plan_type, referral_creator_id, included_creator, add_on_creators, created_at')
    .eq('status', 'active');
  if (subsError) throw subsError;

  const { start, end } = monthRange(period);
  const paidInPeriod = (sub) => {
    const created = new Date(sub.created_at).getTime() / 1000;
    return created >= start && created < end;
  };

  const breakdown = {};
  const ensure = (id) => {
    if (!breakdown[id]) breakdown[id] = { included: 0, addons: 0, flatCoded: 0, flatSplitShare: 0 };
    return breakdown[id];
  };

  for (const sub of subs || []) {
    if (sub.plan_type === 'free_trial') continue;
    if (sub.plan_type === 'promo_5mo') {
      if (paidInPeriod(sub)) {
        if (sub.referral_creator_id && activeCreatorIds.includes(sub.referral_creator_id)) {
          ensure(sub.referral_creator_id).flatCoded++;
        } else if (activeCreatorIds.length > 0) {
          activeCreatorIds.forEach((id) => { ensure(id).flatSplitShare += 1 / activeCreatorIds.length; });
        }
      }
      continue;
    }
    if (sub.plan_type === 'flat_access') {
      if (sub.referral_creator_id && activeCreatorIds.includes(sub.referral_creator_id)) {
        ensure(sub.referral_creator_id).flatCoded++;
      } else if (activeCreatorIds.length > 0) {
        activeCreatorIds.forEach((id) => { ensure(id).flatSplitShare += 1 / activeCreatorIds.length; });
      }
      continue;
    }
    if (sub.included_creator) ensure(sub.included_creator).included++;
    if (sub.add_on_creators) {
      const addOns = Array.isArray(sub.add_on_creators) ? sub.add_on_creators : sub.add_on_creators.split(',').filter(Boolean);
      addOns.forEach((id) => { ensure(id).addons++; });
    }
  }

  let feeRate = 0;
  if (process.env.STRIPE_REPORTING_KEY) {
    const { usd } = await fetchStripeChargeTotal(start, end);
    if (usd.totalRevenue > 0) feeRate = usd.stripeFees / usd.totalRevenue;
  }
  const netMultiplier = 1 - feeRate;

  const amounts = {};
  for (const id in breakdown) {
    const d = breakdown[id];
    amounts[id] = Math.round((d.included * 8 + d.addons * 4 + d.flatCoded * 8 + d.flatSplitShare * 10) * netMultiplier * 100) / 100;
  }
  return { period, breakdown, amounts, feeRate };
}
