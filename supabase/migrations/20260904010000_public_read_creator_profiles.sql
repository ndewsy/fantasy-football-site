-- The only existing SELECT policy on profiles is "auth.uid() = id" (own row
-- only), which is correct for private account data but broke the public
-- creator pages (app/creators/*): every visitor except the creator
-- themselves, logged in, got zero rows back for that creator's profile,
-- silently falling back to placeholder bio/photo text.
--
-- Creator bios/photos/handles are public marketing content by design (shown
-- on public /creators pages), so a public SELECT policy scoped to creator
-- rows is the correct fix, not routing these public page reads through a
-- privileged service-role API route.
CREATE POLICY "Public can view creator profiles" ON public.profiles
  FOR SELECT
  USING (is_creator = true);
