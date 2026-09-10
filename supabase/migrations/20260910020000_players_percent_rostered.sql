-- % of ESPN fantasy leagues rostering each player (platform-wide average,
-- not segmented by league size — see app/api/cron/sync-roster-pct/route.js).
ALTER TABLE players ADD COLUMN IF NOT EXISTS percent_rostered numeric;
