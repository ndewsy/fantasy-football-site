-- Start/Sit vouchers: free-account users get 3 comparisons/month, tracked
-- per calendar month so the count naturally resets. Paying subscribers and
-- dashboard users (admin/creator) bypass this entirely (see lib/startSitAccess.js).
CREATE TABLE start_sit_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  used_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, year_month)
);

-- Server-side only (service-role key), same pattern as player_prop_lines/waiver_wire_entries.
ALTER TABLE public.start_sit_usage ENABLE ROW LEVEL SECURITY;

-- Atomic check-and-increment so two concurrent requests (e.g. two open tabs)
-- can't both slip through when a user has exactly one voucher left.
CREATE OR REPLACE FUNCTION consume_start_sit_voucher(p_user_id uuid, p_limit integer DEFAULT 3)
RETURNS TABLE(allowed boolean, used_count integer, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM');
  v_used integer;
BEGIN
  INSERT INTO start_sit_usage (user_id, year_month, used_count)
  VALUES (p_user_id, v_month, 0)
  ON CONFLICT (user_id, year_month) DO NOTHING;

  SELECT s.used_count INTO v_used
  FROM start_sit_usage s
  WHERE s.user_id = p_user_id AND s.year_month = v_month
  FOR UPDATE;

  IF v_used >= p_limit THEN
    RETURN QUERY SELECT false, v_used, 0;
  ELSE
    UPDATE start_sit_usage
    SET used_count = v_used + 1, updated_at = now()
    WHERE start_sit_usage.user_id = p_user_id AND start_sit_usage.year_month = v_month;
    RETURN QUERY SELECT true, v_used + 1, p_limit - (v_used + 1);
  END IF;
END;
$$;
