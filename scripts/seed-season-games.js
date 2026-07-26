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

function inferKickoff(dateStr) {
  // Infers a UTC kickoff from a local ET date string.
  // In September EDT = UTC-4. Standard windows:
  //   Sunday 1:00pm ET  → T17:00:00Z
  //   Sunday 4:25pm ET  → T20:25:00Z (handled via KNOWN_KICKOFFS for specific games)
  //   Sunday 8:20pm ET  → T00:20:00Z next day (SNF)
  //   Thursday 8:20pm ET → T00:20:00Z next day (TNF)
  //   Monday 8:15pm ET  → T00:15:00Z next day (MNF)
  // Default to Sunday 1pm ET for any unrecognised date.
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun 1=Mon … 4=Thu
  if (dow === 0) return `${dateStr}T17:00:00Z`;  // Sunday 1pm ET
  if (dow === 1) {
    // MNF — 8:15pm Mon ET = Tue 00:15 UTC; return next-day timestamp
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().split('T')[0];
    return `${next}T00:15:00Z`;
  }
  if (dow === 4) {
    // TNF — 8:20pm Thu ET = Fri 00:20 UTC
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().split('T')[0];
    return `${next}T00:20:00Z`;
  }
  // Wed opener or other special games — also shift to next-day midnight UTC
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().split('T')[0];
  return `${next}T00:20:00Z`;
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
