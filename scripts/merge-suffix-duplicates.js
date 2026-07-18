// Executes the 12 approved suffix-duplicate merges:
//   - Renames each canonical (lower-ID, bare-name) entry to the correct suffix spelling
//   - Repoints all ranking references from duplicate IDs to canonical IDs
//   - Deletes the duplicate rows (higher-ID migration artifacts, no adp_rank)
//
// Human-approved on 2026-07-18. Do NOT re-run — idempotent checks are
// included but the deletions are permanent.
//
// Usage (Node 20+):
//   node --env-file=.env.local scripts/merge-suffix-duplicates.js

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Approved merge list (human-reviewed 2026-07-18).
// canonicalId: keep this row, rename to canonicalName
// duplicateId: repoint rankings away from this ID, then delete this row
const MERGES = [
  { canonicalId: 108, canonicalName: "Brian Robinson Jr.",  duplicateId: 316 },
  { canonicalId:  91, canonicalName: "Brian Thomas Jr.",    duplicateId: 310 },
  { canonicalId: 190, canonicalName: "Chris Rodriguez Jr.", duplicateId: 314 },
  { canonicalId:  84, canonicalName: "Harold Fannin Jr.",   duplicateId: 309 },
  { canonicalId:  56, canonicalName: "Luther Burden III",   duplicateId: 306 },
  { canonicalId: 104, canonicalName: "Marvin Harrison Jr.", duplicateId: 307 },
  { canonicalId: 242, canonicalName: "Marvin Mims Jr.",     duplicateId: 345 },
  { canonicalId: 130, canonicalName: "Michael Pittman Jr.", duplicateId: 308 },
  { canonicalId: 193, canonicalName: "Omar Cooper Jr.",     duplicateId: 317 },
  { canonicalId: 113, canonicalName: "Oronde Gadsden II",   duplicateId: 318 },
  { canonicalId:  43, canonicalName: "Travis Etienne Jr.",  duplicateId: 305 },
  { canonicalId: 148, canonicalName: "Tyrone Tracy Jr.",    duplicateId: 315 },
];

const duplicateIds = new Set(MERGES.map(m => m.duplicateId));
const dupToCanonical = Object.fromEntries(MERGES.map(m => [m.duplicateId, m.canonicalId]));

async function main() {
  // ── 1. Verify canonical rows still exist and haven't already been renamed ──
  const { data: canonicalRows, error: cErr } = await supabase
    .from("players")
    .select("id, name")
    .in("id", MERGES.map(m => m.canonicalId));
  if (cErr) { console.error("Failed to fetch canonical rows:", cErr.message); process.exit(1); }

  const canonicalById = Object.fromEntries((canonicalRows || []).map(r => [r.id, r]));
  for (const m of MERGES) {
    const row = canonicalById[m.canonicalId];
    if (!row) { console.error(`ABORT: canonical ID ${m.canonicalId} not found`); process.exit(1); }
    if (row.name === m.canonicalName) {
      console.log(`[skip-rename] ID ${m.canonicalId} already named "${m.canonicalName}"`);
    }
  }

  // ── 2. Rename canonical entries to their suffix spelling ──────────────────
  console.log("\n── Step 1: Rename canonical entries ──");
  for (const m of MERGES) {
    const current = canonicalById[m.canonicalId];
    if (current?.name === m.canonicalName) continue; // already done

    const { error } = await supabase
      .from("players")
      .update({ name: m.canonicalName })
      .eq("id", m.canonicalId);

    if (error) {
      console.error(`  [error] ID ${m.canonicalId}: ${error.message}`);
    } else {
      console.log(`  [ok]   ID ${m.canonicalId}: "${current?.name}" → "${m.canonicalName}"`);
    }
  }

  // ── 3. Fetch all ranking rows ─────────────────────────────────────────────
  console.log("\n── Step 2: Repoint ranking references ──");
  const { data: rankingRows, error: rErr } = await supabase
    .from("rankings")
    .select("creator_id, format, players");
  if (rErr) { console.error("Failed to fetch rankings:", rErr.message); process.exit(1); }

  let rowsUpdated = 0;
  let refsRepointed = 0;

  for (const row of (rankingRows || [])) {
    const raw = row.players;
    const ranked = Array.isArray(raw) ? raw : (raw?.ranked || []);
    const unranked = Array.isArray(raw?.unranked) ? raw.unranked : [];

    // Check if this row references any duplicate IDs
    const rankedHasDup = ranked.some(id => duplicateIds.has(id));
    const unrankedHasDup = unranked.some(id => duplicateIds.has(id));
    if (!rankedHasDup && !unrankedHasDup) continue;

    // Replace duplicate IDs with canonical IDs (deduplicate if canonical is
    // already present — shouldn't happen but guard anyway)
    const seenRanked = new Set();
    const newRanked = ranked.map(id => duplicateIds.has(id) ? dupToCanonical[id] : id)
      .filter(id => { if (seenRanked.has(id)) return false; seenRanked.add(id); return true; });

    const seenUnranked = new Set(newRanked); // don't allow same ID in both lists
    const newUnranked = unranked.map(id => duplicateIds.has(id) ? dupToCanonical[id] : id)
      .filter(id => { if (seenUnranked.has(id)) return false; seenUnranked.add(id); return true; });

    const countBefore = ranked.filter(id => duplicateIds.has(id)).length
                      + unranked.filter(id => duplicateIds.has(id)).length;

    const { error: updateErr } = await supabase
      .from("rankings")
      .update({ players: { ranked: newRanked, unranked: newUnranked } })
      .eq("creator_id", row.creator_id)
      .eq("format", row.format);

    if (updateErr) {
      console.error(`  [error] ${row.creator_id}/${row.format}: ${updateErr.message}`);
    } else {
      console.log(`  [ok]   ${row.creator_id}/${row.format}: repointed ${countBefore} reference(s)`);
      rowsUpdated++;
      refsRepointed += countBefore;
    }
  }

  // ── 4. Delete duplicate rows ──────────────────────────────────────────────
  console.log("\n── Step 3: Delete duplicate player rows ──");
  const { data: deleted, error: dErr } = await supabase
    .from("players")
    .delete()
    .in("id", [...duplicateIds])
    .select("id, name");

  if (dErr) {
    console.error(`  [error] Delete failed: ${dErr.message}`);
  } else {
    for (const d of (deleted || [])) {
      console.log(`  [ok]   Deleted ID ${d.id} ("${d.name}")`);
    }
  }

  // ── 5. Summary ────────────────────────────────────────────────────────────
  console.log(`
── Done ──
  Canonical entries renamed : ${MERGES.length}
  Ranking rows updated      : ${rowsUpdated}
  References repointed      : ${refsRepointed}
  Duplicate rows deleted    : ${deleted?.length ?? "error"}
`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
