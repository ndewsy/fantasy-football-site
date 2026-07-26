// Run with: node --env-file=.env.local scripts/seed-season-games.js
//
// Upserts all season_games rows from schedule-data.js.
// Safe to re-run — uses upsert on the integer PK.

import { createClient } from '@supabase/supabase-js';
import { WEEKS } from './schedule-data.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Only game 1's exact kickoff matters for the lock (it's the min).
// Everything else just needs to be in the right order/day.
const KNOWN_KICKOFFS = {
  '1-0': '2026-09-10T00:20:00Z', // NE @ SEA, Wed 9/9 8:20pm ET
};

function inferKickoff(displayDate) {
  // Parses display dates like 'Wed 9/9', 'Sun 9/13', 'Thu 12/31', 'Sun 1/10'.
  // Months 1–2 are assumed to be 2027 (Jan/Feb); all others are 2026.
  // Only game 1's exact kickoff matters for the lock — that's in KNOWN_KICKOFFS.
  const match = displayDate.match(/^(\w{3})\s+(\d+)\/(\d+)$/);
  if (!match) return null;
  const [, dow, mo, dy] = match;
  const month = parseInt(mo, 10);
  const day   = parseInt(dy, 10);
  const year  = month <= 2 ? 2027 : 2026;

  const dateUTC = new Date(Date.UTC(year, month - 1, day));
  const dateStr = dateUTC.toISOString().split('T')[0]; // YYYY-MM-DD
  const nextStr = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().split('T')[0];

  // Standard prime-time windows (all approximate — only game 1 needs to be exact):
  //   Sun 1pm ET  → 18:00 UTC (EST) / 17:00 UTC (EDT) — use 18:00 as safe default
  //   Thu/Wed/Wed-opener 8:20pm ET → next-day 00:20 UTC
  //   Mon 8:15pm ET → next-day 00:15 UTC
  //   Fri (Black Friday / Christmas) 3pm ET → 20:00 UTC
  //   Sat 1pm ET → 18:00 UTC
  if (dow === 'Sun') return `${dateStr}T18:00:00Z`;
  if (dow === 'Mon') return `${nextStr}T00:15:00Z`;
  if (dow === 'Thu' || dow === 'Wed') return `${nextStr}T00:20:00Z`;
  if (dow === 'Fri') return `${dateStr}T20:00:00Z`;
  if (dow === 'Sat') return `${dateStr}T18:00:00Z`;
  return `${dateStr}T18:00:00Z`;
}

async function seed() {
  let id = 0;
  let inserted = 0;

  for (const week of WEEKS) {
    for (let i = 0; i < week.g.length; i++) {
      const [away, home] = week.g[i];
      const key = `${week.n}-${i}`;
      const kickoff = KNOWN_KICKOFFS[key] ?? inferKickoff(week.dates[i]);

      const { error } = await supabase.from('season_games').upsert({
        id: id + 1,
        week: week.n,
        away_team: away,
        home_team: home,
        kickoff_at: kickoff,
        espn_event_id: null, // backfilled by first sync run, matched on week+teams
      });

      if (error) console.error(`  ✗ week ${week.n} game ${i} (${away}@${home}):`, error.message);
      else inserted++;
      id++;
    }
  }

  console.log(`Seeded ${inserted} games.`);
}

seed().catch(err => { console.error(err); process.exit(1); });
