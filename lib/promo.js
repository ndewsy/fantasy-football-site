// August promo: $10 one-time payment for 5 months of full access, instead of the
// normal $10/month recurring plan. Ends 2026-09-08 23:59:59 Eastern (EDT, UTC-4) —
// after that, checkout automatically reverts to the standard recurring plan.
export const PROMO_CUTOFF = new Date('2026-09-09T03:59:59.000Z');

export function isPromoActive(now = new Date()) {
  return now.getTime() <= PROMO_CUTOFF.getTime();
}
