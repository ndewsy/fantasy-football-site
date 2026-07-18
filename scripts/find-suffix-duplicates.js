// Scans the players table for near-duplicate names caused by generational
// suffixes (Jr./Sr./II/III/IV) being present on one entry and absent on another.
//
// Outputs a proposed merge list for human review — does NOT write anything.
//
// Usage (Node 20+):
//   node --env-file=.env.local scripts/find-suffix-duplicates.js

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Suffixes to strip, matched at the end of the name (case-insensitive).
// Handles "Jr.", "Jr", "Sr.", "Sr", "II", "III", "IV", "V" with optional
// preceding comma and/or whitespace.
const SUFFIX_RE = /[\s,]+(Jr\.?|Sr\.?|II|III|IV|V)$/i;

function baseName(name) {
  return name.replace(SUFFIX_RE, "").trim();
}

function normalizeName(name) {
  return name.toLowerCase().replace(/\./g, " ").trim().replace(/\s+/g, " ");
}

// Levenshtein distance for fuzzy matching within groups.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

async function main() {
  // 1. Fetch all players (active and inactive so we don't miss anything)
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, name, position, team, adp_rank")
    .order("id");
  if (pErr) { console.error("Failed to fetch players:", pErr.message); process.exit(1); }

  console.error(`Loaded ${players.length} players from table.`);

  // 2. Fetch all rankings to know which player_ids are actually in use
  const { data: rankingRows, error: rErr } = await supabase
    .from("rankings")
    .select("creator_id, format, players");
  if (rErr) { console.error("Failed to fetch rankings:", rErr.message); process.exit(1); }

  // Build a map: player_id → list of "creator/format" strings that reference it
  const idToUsage = {};
  for (const row of (rankingRows || [])) {
    const raw = row.players;
    const ranked = Array.isArray(raw) ? raw : (raw?.ranked || []);
    const unranked = Array.isArray(raw?.unranked) ? raw.unranked : [];
    for (const id of [...ranked, ...unranked]) {
      if (typeof id !== "number") continue;
      if (!idToUsage[id]) idToUsage[id] = [];
      idToUsage[id].push(`${row.creator_id}/${row.format}`);
    }
  }

  // 3. Group players by their base name (suffix stripped, then normalized)
  // Key: normalizedBaseName → [player, ...]
  const groups = {};
  for (const p of players) {
    const base = normalizeName(baseName(p.name));
    if (!groups[base]) groups[base] = [];
    groups[base].push(p);
  }

  // 4. Keep only groups with more than one member — these are suspected duplicates
  const duplicateGroups = Object.entries(groups)
    .filter(([, members]) => members.length > 1)
    .map(([baseKey, members]) => ({ baseKey, members }))
    .sort((a, b) => a.baseKey.localeCompare(b.baseKey));

  // 5. Within each group, pick a canonical: prefer the entry with a suffix
  //    (it's more specific), then by lowest adp_rank (most used / earliest),
  //    then by lowest id.
  function hasSuffix(name) { return SUFFIX_RE.test(name); }

  const mergeGroups = duplicateGroups.map(({ baseKey, members }) => {
    // Sort: has-suffix first, then adp_rank ascending (nulls last), then id
    const sorted = [...members].sort((a, b) => {
      const aSuffix = hasSuffix(a.name) ? 0 : 1;
      const bSuffix = hasSuffix(b.name) ? 0 : 1;
      if (aSuffix !== bSuffix) return aSuffix - bSuffix;
      const aAdp = a.adp_rank ?? 9999;
      const bAdp = b.adp_rank ?? 9999;
      if (aAdp !== bAdp) return aAdp - bAdp;
      return a.id - b.id;
    });

    const canonical = sorted[0];
    const duplicates = sorted.slice(1);

    // Check position/team consistency — flag mismatches
    const posMatch = members.every(m => m.position === canonical.position || !m.position);
    const teamMatch = members.every(m => m.team === canonical.team || !m.team);

    return {
      base_name_key: baseKey,
      canonical: {
        id: canonical.id,
        name: canonical.name,
        position: canonical.position,
        team: canonical.team,
        adp_rank: canonical.adp_rank,
        usage: idToUsage[canonical.id] || [],
      },
      duplicates: duplicates.map(d => ({
        id: d.id,
        name: d.name,
        position: d.position,
        team: d.team,
        adp_rank: d.adp_rank,
        usage: idToUsage[d.id] || [],
      })),
      warnings: [
        !posMatch && "POSITION MISMATCH — verify these are the same player",
        !teamMatch && "TEAM MISMATCH — verify these are the same player",
      ].filter(Boolean),
    };
  });

  // 6. Summary
  const totalDups = mergeGroups.reduce((n, g) => n + g.duplicates.length, 0);
  const totalRankingRefs = mergeGroups.reduce(
    (n, g) => n + g.duplicates.reduce((m, d) => m + d.usage.length, 0), 0
  );

  const report = {
    summary: {
      groups_with_suffix_duplicates: mergeGroups.length,
      duplicate_player_rows_to_remove: totalDups,
      ranking_references_to_repoint: totalRankingRefs,
    },
    merge_groups: mergeGroups,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => { console.error(err.message); process.exit(1); });
