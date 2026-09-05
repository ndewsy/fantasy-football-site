-- Flips the site's default theme to dark (light becomes the opt-in toggle).
-- Every existing row is still sitting on the untouched old default of
-- 'light' (nobody had a real reason to have set it explicitly yet, this
-- shipped minutes ago) except the one account that already opted into dark
-- — that row is left alone since it's already correct either way.
ALTER TABLE profiles ALTER COLUMN theme SET DEFAULT 'dark';
UPDATE profiles SET theme = 'dark' WHERE theme = 'light';
