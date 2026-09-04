-- Lets a creator have more than one referral code (profiles.referral_code
-- only supports one). Checkout checks this table as a fallback when a code
-- doesn't match any profile directly, attributing it to the same creator_id.
CREATE TABLE IF NOT EXISTS referral_code_aliases (
  code text PRIMARY KEY,
  creator_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_code_aliases_code_unique_ci
  ON referral_code_aliases (lower(code));

-- Server-side only, same pattern as the other recent tables.
ALTER TABLE public.referral_code_aliases ENABLE ROW LEVEL SECURITY;
