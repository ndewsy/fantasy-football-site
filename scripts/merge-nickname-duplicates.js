// Executes the approved nickname-duplicate merge:
//   Chig Okonkwo (ID 180, canonical, has adp_rank) ←
//   Chigozeim Okonkwo (ID 313, migration artifact, no adp_rank)
//
// Human-approved 2026-07-18. Repoints ffhuddle's Redraft 1QB and Dynasty SF
// rankings from ID 313 to ID 180, then deletes ID 313.
//
// Usage (Node 20+):
//   node --env-file=.env.local scripts/merge-nickname-duplicates.js

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// canonicalId: keep (already has the right name "Chig Okonkwo")
// duplicateId: repoint rankings away from, then delete
const MERGES = [
  { canonicalId: 180, canonicalName: "Chig Okonkwo", duplicateId: 313 },
];

const duplicateIds = new Set(MERGES.map(m => m.duplicateId));
const dupToCanonical = Object.fromEntries(MERGES.map(m => [m.duplicateId, m.canonicalId]));

async function main() {
  // ── 1. Verify canonical row exists ───────────────────────────────────────
  const { data: canonicalRows, error: cErr } = await supabase
    .from("players")
    .select("id, name")
    .in("id", MERGES.map(m => m.canonicalId));
  if (cErr) { console.error("Failed to fetch canonical rows:", cErr.message); process.exit(1); }

  const canonicalById = Object.fromEntries((canonicalRows || []).map(r => [r.id, r]));
  for (const m of MERGES) {
    if (!canonicalById[m.canonicalId]) {
      console.error(`ABORT: canonical ID ${m.canonicalId} not found`);
      process.exit(1);
    }
    console.log(`[ok] Canonical: ID ${m.canonicalId} "${canonicalById[m.canonicalId].name}" (no rename needed)`);
  }

  // ── 2. Repoint ranking references ────────────────────────────────────────
  console.log("\n── Step 1: Repoint ranking references ──");
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

    if (!ranked.some(id => duplicateIds.has(id)) && !unranked.some(id => duplicateIds.has(id))) continue;

    const seenRanked = new Set();
    const newRanked = ranked
      .map(id => duplicateIds.has(id) ? dupToCanonical[id] : id)
      .filter(id => { if (seenRanked.has(id)) return false; seenRanked.add(id); return true; });

    const seenUnranked = new Set(newRanked);
    const newUnranked = unranked
      .map(id => duplicateIds.has(id) ? dupToCanonical[id] : id)
      .filter(id => { if (seenUnranked.has(id)) return false; seenUnranked.add(id); return true; });

    const count = ranked.filter(id => duplicateIds.has(id)).length
                + unranked.filter(id => duplicateIds.has(id)).length;

    const { error } = await supabase
      .from("rankings")
      .update({ players: { ranked: newRanked, unranked: newUnranked } })
      .eq("creator_id", row.creator_id)
      .eq("format", row.format);

    if (error) {
      console.error(`  [error] ${row.creator_id}/${row.format}: ${error.message}`);
    } else {
      console.log(`  [ok]    ${row.creator_id}/${row.format}: repointed ${count} reference(s)`);
      rowsUpdated++;
      refsRepointed += count;
    }
  }

  // ── 3. Delete duplicate rows ──────────────────────────────────────────────
  console.log("\n── Step 2: Delete duplicate player rows ──");
  const { data: deleted, error: dErr } = await supabase
    .from("players")
    .delete()
    .in("id", [...duplicateIds])
    .select("id, name");

  if (dErr) {
    console.error(`  [error] ${dErr.message}`);
  } else {
    for (const d of (deleted || [])) {
      console.log(`  [ok]    Deleted ID ${d.id} ("${d.name}")`);
    }
  }

  console.log(`
── Done ──
  Ranking rows updated   : ${rowsUpdated}
  References repointed   : ${refsRepointed}
  Duplicate rows deleted : ${deleted?.length ?? "error"}
`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
