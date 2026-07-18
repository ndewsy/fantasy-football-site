// Migrates rankings.players from embedded player objects to player_id integer arrays.
//
// Safe to re-run — rows already in integer format are skipped automatically.
//
// Usage (Node 20+):
//   node --env-file=.env.local scripts/migrate-to-player-ids.js
//
// Run AFTER deploying app code that supports both formats.

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function normalizeName(name) {
  return name.toLowerCase().replace(/\./g, " ").trim().replace(/\s+/g, " ");
}

// Exact-name aliases: names in rankings that don't match any players-table entry
// by either exact or normalized-key lookup, but ARE the same player.
const ALIASES = {
  "AJ Brown": 29,     // normalizes to "aj brown" ≠ "a j brown" (A.J. Brown, ID 29)
  "Alvin Kamra": 160, // typo — should be Alvin Kamara (ID 160)
};

function parsePlayers(raw) {
  if (!raw) return { ranked: [], unranked: [] };
  if (Array.isArray(raw)) {
    return {
      ranked: raw.filter(p => !p.unranked),
      unranked: raw.filter(p => p.unranked),
    };
  }
  return {
    ranked: raw.ranked || [],
    unranked: raw.unranked || [],
  };
}

function isAlreadyMigrated(raw) {
  if (!raw) return false;
  const ranked = Array.isArray(raw) ? raw.filter(p => !p.unranked) : (raw.ranked || []);
  return ranked.length > 0 && typeof ranked[0] === "number";
}

async function main() {
  // --- 1. Build name→id lookups from the existing players table ---
  const { data: tablePlayers, error: tErr } = await supabase
    .from("players")
    .select("id, name, position, team");
  if (tErr) { console.error("Failed to fetch players table:", tErr.message); process.exit(1); }

  const nameToId = {};   // exact name
  const normToId = {};   // normalized name (fallback)
  for (const p of (tablePlayers || [])) {
    nameToId[p.name] = p.id;
    normToId[normalizeName(p.name)] = p.id;
  }
  console.log(`Loaded ${tablePlayers?.length || 0} existing players from table.`);

  // --- 2. Read all rankings rows ---
  const { data: rankingRows, error: rErr } = await supabase
    .from("rankings")
    .select("creator_id, format, players");
  if (rErr) { console.error("Failed to fetch rankings:", rErr.message); process.exit(1); }
  console.log(`Found ${rankingRows?.length || 0} rankings rows.`);

  // --- 3. Collect all player names that need IDs ---
  const nameDetailsMap = {}; // name → { position, team } from any ranking row
  const allNames = new Set();

  for (const row of (rankingRows || [])) {
    if (isAlreadyMigrated(row.players)) continue;
    const { ranked, unranked } = parsePlayers(row.players);
    for (const p of [...ranked, ...unranked]) {
      if (!p.name) continue;
      allNames.add(p.name);
      if (!nameDetailsMap[p.name]) {
        nameDetailsMap[p.name] = {
          position: p.pos || p.position || "?",
          team: p.team || "FA",
        };
      }
    }
  }

  // --- 4. Insert players whose name has no existing mapping ---
  const toInsert = [];
  for (const name of allNames) {
    const hasId = nameToId[name] || normToId[normalizeName(name)] || ALIASES[name];
    if (!hasId) toInsert.push(name);
  }

  if (toInsert.length > 0) {
    console.log(`\nInserting ${toInsert.length} new players:`);
    const rows = toInsert.map(name => ({
      name,
      position: nameDetailsMap[name]?.position || "?",
      team: nameDetailsMap[name]?.team || "FA",
    }));
    for (const row of rows) console.log(`  ${row.name} (${row.position}, ${row.team})`);

    const { data: inserted, error: iErr } = await supabase
      .from("players")
      .insert(rows)
      .select("id, name");
    if (iErr) { console.error("Insert failed:", iErr.message); process.exit(1); }

    for (const p of (inserted || [])) {
      nameToId[p.name] = p.id;
      normToId[normalizeName(p.name)] = p.id;
    }
    console.log(`Inserted ${inserted?.length || 0} players.`);
  } else {
    console.log("No new players to insert — all names already have IDs.");
  }

  // --- 5. Resolve a name to its canonical player ID ---
  function lookupId(name) {
    return nameToId[name]
      || normToId[normalizeName(name)]
      || ALIASES[name]
      || null;
  }

  // --- 6. Rewrite all rankings rows ---
  let updated = 0;
  let skipped = 0;
  let warnings = 0;

  for (const row of (rankingRows || [])) {
    const label = `${row.creator_id}/${row.format}`;

    if (isAlreadyMigrated(row.players)) {
      console.log(`  [skip] ${label} — already in integer format`);
      skipped++;
      continue;
    }

    const { ranked: rankedObjs, unranked: unrankedObjs } = parsePlayers(row.players);

    const rankedIds = rankedObjs.map(p => {
      const id = lookupId(p.name);
      if (!id) { console.warn(`  [warn] No ID for "${p.name}" in ${label}`); warnings++; }
      return id;
    }).filter(Boolean);

    const unrankedIds = unrankedObjs.map(p => {
      const id = lookupId(p.name);
      if (!id) { console.warn(`  [warn] No ID for "${p.name}" (unranked) in ${label}`); warnings++; }
      return id;
    }).filter(Boolean);

    const { error: updateErr } = await supabase
      .from("rankings")
      .update({ players: { ranked: rankedIds, unranked: unrankedIds } })
      .eq("creator_id", row.creator_id)
      .eq("format", row.format);

    if (updateErr) {
      console.error(`  [error] ${label}: ${updateErr.message}`);
    } else {
      console.log(`  [ok]   ${label}: ${rankedIds.length} ranked, ${unrankedIds.length} unranked`);
      updated++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${warnings} warnings`);
  if (warnings > 0) {
    console.warn("Some players had no ID and were dropped. Check the warnings above.");
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
