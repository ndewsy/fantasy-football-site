// Reads all creator rankings from Supabase and produces a merge-group report
// showing which player name variants would be unified into one canonical entry.
//
// Usage (Node 20+):
//   node --env-file=.env.local scripts/generate-merge-report.js
//
// Usage (Node 18):
//   export $(grep -v '^#' .env.local | xargs) && node scripts/generate-merge-report.js
//
// Requires in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL   — your Supabase project URL
//   SUPABASE_SECRET_KEY        — service role key

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Same normalization as app/page.js
function normalizeName(name) {
  return name.toLowerCase().replace(/\./g, " ").trim().replace(/\s+/g, " ");
}

function parsePlayers(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(({ unranked: _, ...p }) => p);
  return [...(raw.ranked || []), ...(raw.unranked || [])];
}

// Pick the canonical display name from a group: most-used variant wins; ties broken alphabetically.
function pickCanonical(variants) {
  return variants.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0];
}

async function main() {
  // --- 1. Fetch all creator rankings ---
  const { data: rankingRows, error: rErr } = await supabase
    .from("rankings")
    .select("creator_id, format, players");
  if (rErr) { console.error("Failed to fetch rankings:", rErr.message); process.exit(1); }

  // --- 2. Fetch existing players table ---
  const { data: existingPlayers, error: pErr } = await supabase
    .from("players")
    .select("id, name, position, team");
  if (pErr) { console.error("Failed to fetch players table:", pErr.message); process.exit(1); }

  // Build a normalized-name → existing player lookup
  const existingByNorm = {};
  for (const p of (existingPlayers || [])) {
    existingByNorm[normalizeName(p.name)] = p;
  }

  // --- 3. Walk every creator's ranked + unranked lists ---
  // normalizedKey → { variants: Map<rawName, { name, pos, team, count }>, occurrences: [] }
  const groups = {};

  for (const row of (rankingRows || [])) {
    const players = parsePlayers(row.players);
    for (const p of players) {
      if (!p.name) continue;
      const key = normalizeName(p.name);
      if (!groups[key]) groups[key] = { variants: new Map(), occurrences: [] };
      const g = groups[key];
      if (!g.variants.has(p.name)) {
        g.variants.set(p.name, { name: p.name, pos: p.pos || p.position || "?", team: p.team || "FA", count: 0 });
      }
      g.variants.get(p.name).count++;
      g.occurrences.push({ creator_id: row.creator_id, format: row.format, as: p.name });
    }
  }

  // --- 4. Separate merge groups (>1 distinct raw name) from singles ---
  const mergeGroups = [];
  const allCanonical = [];

  for (const [key, g] of Object.entries(groups)) {
    const variants = [...g.variants.values()];
    const canonical = pickCanonical([...variants]);
    const inExistingTable = !!existingByNorm[key];
    const existingId = existingByNorm[key]?.id ?? null;

    const entry = {
      normalized_key: key,
      proposed_name: canonical.name,
      proposed_pos: canonical.pos,
      proposed_team: canonical.team,
      existing_players_id: existingId,
      total_occurrences: g.occurrences.length,
      creators: [...new Set(g.occurrences.map(o => `${o.creator_id}/${o.format}`))],
    };

    allCanonical.push(entry);

    if (variants.length > 1) {
      mergeGroups.push({
        normalized_key: key,
        proposed_canonical_name: canonical.name,
        existing_players_id: existingId,
        variants: variants.map(v => ({
          name: v.name,
          pos: v.pos,
          team: v.team,
          count: v.count,
          seen_in: g.occurrences.filter(o => o.as === v.name).map(o => `${o.creator_id}/${o.format}`),
        })),
      });
    }
  }

  // --- 5. Players in the existing table NOT in any creator ranking ---
  const notInAnyRanking = (existingPlayers || []).filter(
    p => !groups[normalizeName(p.name)]
  );

  // --- 6. Output ---
  const report = {
    summary: {
      total_unique_normalized_names: Object.keys(groups).length,
      merge_groups_with_variants: mergeGroups.length,
      names_in_existing_players_table: (existingPlayers || []).length,
      existing_players_not_in_any_ranking: notInAnyRanking.length,
      names_in_rankings_not_in_players_table: allCanonical.filter(e => !e.existing_players_id).length,
    },
    merge_groups: mergeGroups,
    all_canonical_players: allCanonical.sort((a, b) => a.normalized_key.localeCompare(b.normalized_key)),
    existing_players_not_in_any_ranking: notInAnyRanking.map(p => ({ id: p.id, name: p.name, position: p.position, team: p.team })),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => { console.error(err.message); process.exit(1); });
