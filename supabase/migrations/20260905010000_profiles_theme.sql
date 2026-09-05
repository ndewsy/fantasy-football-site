-- Per-account dark mode preference, toggled from the Account page. Defaults
-- every existing user to light — nothing changes until they opt in.
ALTER TABLE profiles ADD COLUMN theme text CHECK (theme IN ('light', 'dark')) DEFAULT 'light';
