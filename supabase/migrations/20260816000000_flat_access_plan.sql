ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'legacy'
    CHECK (plan_type IN ('legacy', 'flat_access')),
  ADD COLUMN IF NOT EXISTS referral_creator_id text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique_ci
  ON profiles (lower(referral_code))
  WHERE referral_code IS NOT NULL;
