-- These 4 tables were created without RLS (Supabase Security Advisor flagged
-- them as publicly exposed via PostgREST). All access to them is server-side
-- only, through API routes using the service-role key, which bypasses RLS —
-- so enabling RLS with zero policies closes the anon/authenticated exposure
-- without touching any app functionality. Matches the existing pattern used
-- for rankings/rankings_history/player_adp_history (also server-route-only).
ALTER TABLE public.player_prop_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_prop_unmatched ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_season_stats ENABLE ROW LEVEL SECURITY;
