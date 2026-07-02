// Import skill position players from Sleeper's public API into Supabase.
//
// Usage (Node 20+):
//   node --env-file=.env.local scripts/import-players.js
//
// On Node 18:
//   export $(grep -v '^#' .env.local | xargs) && node scripts/import-players.js
//
// Requires in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL       — your Supabase project URL
//   SUPABASE_SECRET_KEY            — service role key (for data upserts)
//   SUPABASE_ACCESS_TOKEN          — personal access token for Management API
//                                    (create at supabase.com/dashboard/account/tokens)

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

// Extract the project ref from e.g. https://abcdefgh.supabase.co
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const SKILL_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

// Run SQL via the Supabase Management API (needs SUPABASE_ACCESS_TOKEN)
async function runSQL(query) {
  if (!ACCESS_TOKEN) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN is not set.\n" +
      "  1. Go to https://supabase.com/dashboard/account/tokens\n" +
      "  2. Generate a personal access token\n" +
      "  3. Add it to .env.local as SUPABASE_ACCESS_TOKEN=your_token\n" +
      "  Then re-run this script.\n\n" +
      "  Alternatively, run this SQL manually in the Supabase SQL Editor:\n\n" +
      CREATE_TABLE_SQL
    );
  }
  if (!projectRef) throw new Error(`Could not extract project ref from URL: ${SUPABASE_URL}`);

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Management API error ${res.status}: ${body}`);
  }
  return res.json();
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS players (
  id        serial primary key,
  sleeper_id text unique,
  name       text,
  position   text,
  team       text,
  adp_rank   integer
);

ALTER TABLE players DISABLE ROW LEVEL SECURITY;
`.trim();

async function ensureTable() {
  // Quick probe — try a cheap query against the table
  const { error } = await supabase.from("players").select("id").limit(1);
  if (!error) {
    console.log("players table already exists, skipping CREATE.");
    return;
  }

  if (!error.message.includes("does not exist") && !error.message.includes("schema cache")) {
    // Some other error — surface it
    throw new Error(`Unexpected error checking players table: ${error.message}`);
  }

  console.log("players table not found — creating via Management API...");
  await runSQL(CREATE_TABLE_SQL);
  console.log("Table created and RLS disabled.");
}

async function main() {
  await ensureTable();

  console.log("Fetching players from Sleeper API...");
  const res = await fetch("https://api.sleeper.app/v1/players/nfl");
  if (!res.ok) throw new Error(`Sleeper API returned ${res.status}`);
  const raw = await res.json();

  const players = Object.values(raw)
    .filter((p) => p.active === true && SKILL_POSITIONS.has(p.position) && p.full_name)
    .sort((a, b) => (a.search_rank ?? 999999) - (b.search_rank ?? 999999))
    .slice(0, 300);

  console.log(`Found ${players.length} active skill position players.`);

  const rows = players.map((p, i) => ({
    sleeper_id: p.player_id,
    name: p.full_name,
    position: p.position,
    team: p.team || "FA",
    adp_rank: i + 1,
  }));

  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("players")
      .upsert(batch, { onConflict: "sleeper_id" });
    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
    } else {
      console.log(`Batch ${Math.floor(i / BATCH) + 1} done (${batch.length} players)`);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
