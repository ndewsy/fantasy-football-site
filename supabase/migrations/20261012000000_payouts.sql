-- The admin "Revenue & Payouts" tab and creator "My Earnings" tab have always
-- queried a `payouts` table that never actually existed — every select/upsert
-- against it silently failed and returned nothing, which is why last month's
-- figures appeared to "vanish" once the current month's live numbers moved on
-- (there was never anywhere a snapshot could have been saved, for any month).
CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id text NOT NULL,
  period text NOT NULL, -- "YYYY-MM"
  amount numeric(10,2) NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, period)
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- A creator can see their own payout rows; an admin can see everyone's.
CREATE POLICY "payouts_select" ON public.payouts
  FOR SELECT USING (
    creator_id = (SELECT creator_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Only an admin can create/mark payouts (the "Mark as Paid" button) via the
-- browser client. The monthly snapshot cron writes with the service-role key,
-- which bypasses RLS entirely.
CREATE POLICY "payouts_admin_insert" ON public.payouts
  FOR INSERT WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "payouts_admin_update" ON public.payouts
  FOR UPDATE USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
