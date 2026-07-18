// Comprehensive duplicate detection across the full players table.
// Combines five normalization strategies in a single pass:
//   1. Strip punctuation (periods, apostrophes, hyphens, commas)
//   2. Collapse whitespace
//   3. Strip generational suffixes (Jr./Sr./II/III/IV/V)
//   4. Levenshtein distance on the fully-normalized base name
//   5. Nickname prefix: same last name + one first name is a prefix of the other
//      (e.g. "Chig Okonkwo" / "Chigozeim Okonkwo", "Cam Newton" / "Cameron Newton")
//
// Outputs a review report — does NOT write anything to the DB.
//
// Usage (Node 20+):
//   node --env-file=.env.local scripts/find-all-duplicates.js

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ── Normalization pipeline ────────────────────────────────────────────────────

const SUFFIX_RE = /[\s,]+(jr\.?|sr\.?|ii|iii|iv|v)$/i;

// Full normalization: lowercase → strip punctuation → collapse spaces → strip suffix
function fullNorm(name) {
  return name
    .toLowerCase()
    .replace(/[.\-']/g, "")   // remove periods, hyphens, apostrophes
    .replace(/\s+/g, " ")
    .trim()
    .replace(SUFFIX_RE, "")
    .trim();
}

// Levenshtein distance
function lev(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// Fuzzy threshold: allow 1 edit per ~8 chars, min 1, max 3.
// Short names get a tighter threshold to reduce noise.
function fuzzyThreshold(name) {
  if (name.length <= 6) return 1;
  if (name.length <= 12) return 2;
  return 3;
}

// Split a normalized full name into { first, last }.
// Handles "first last", "first middle last" (treats everything but last token as first),
// and single-token names (first = "", last = token).
function splitName(normName) {
  const parts = normName.trim().split(" ");
  if (parts.length === 1) return { first: "", last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

// Returns true if nameA and nameB share the same last name AND one first name
// is a non-empty prefix of the other (minimum 2 chars for the shorter prefix
// to avoid single-letter false positives).
function isNicknamePrefixPair(normA, normB) {
  if (normA === normB) return false;
  const a = splitName(normA);
  const b = splitName(normB);
  if (a.last !== b.last) return false;
  if (!a.first || !b.first) return false;
  const shorter = a.first.length <= b.first.length ? a.first : b.first;
  const longer  = a.first.length <= b.first.length ? b.first : a.first;
  // Require the shorter first name to be at least 2 chars and a true prefix
  // (not just equal — equal would be caught by exact normalization).
  if (shorter.length < 2 || shorter === longer) return false;
  return longer.startsWith(shorter);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, name, position, team, adp_rank")
    .order("id");
  if (pErr) { console.error("Failed to fetch players:", pErr.message); process.exit(1); }

  console.error(`Loaded ${players.length} players.`);

  // Fetch rankings for usage data
  const { data: rankingRows, error: rErr } = await supabase
    .from("rankings")
    .select("creator_id, format, players");
  if (rErr) { console.error("Failed to fetch rankings:", rErr.message); process.exit(1); }

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

  // ── Phase 1: exact match after full normalization ────────────────────────
  // Group all players by their fully-normalized base name.
  const normGroups = {};
  for (const p of players) {
    const key = fullNorm(p.name);
    if (!normGroups[key]) normGroups[key] = [];
    normGroups[key].push(p);
  }

  const exactGroups = Object.entries(normGroups)
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => ({
      match_type: "exact_after_normalization",
      normalized_key: key,
      members,
    }));

  // Track pairs already surfaced so phases 2 and 3 don't re-emit them.
  const seenPairs = new Set();
  for (const g of exactGroups) {
    for (let i = 0; i < g.members.length; i++)
      for (let j = i + 1; j < g.members.length; j++) {
        const a = g.members[i].id, b = g.members[j].id;
        seenPairs.add(`${Math.min(a,b)}-${Math.max(a,b)}`);
      }
  }

  // ── Phase 2: fuzzy pairs not already caught by exact grouping ───────────
  const fuzzyPairs = [];

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      const keyA = fullNorm(a.name), keyB = fullNorm(b.name);
      if (keyA === keyB) continue; // already caught in phase 1

      const pairKey = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
      if (seenPairs.has(pairKey)) continue;

      const longer = keyA.length >= keyB.length ? keyA : keyB;
      const threshold = fuzzyThreshold(longer);
      const distance = lev(keyA, keyB);

      if (distance <= threshold) {
        seenPairs.add(pairKey);
        fuzzyPairs.push({
          match_type: "fuzzy",
          edit_distance: distance,
          normalized_key_a: keyA,
          normalized_key_b: keyB,
          members: [a, b],
        });
      }
    }
  }

  // ── Phase 3: nickname prefix pairs ──────────────────────────────────────
  // Same last name + one first name is a prefix of the other.
  const nicknamePairs = [];

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      const keyA = fullNorm(a.name), keyB = fullNorm(b.name);

      const pairKey = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
      if (seenPairs.has(pairKey)) continue;

      if (isNicknamePrefixPair(keyA, keyB)) {
        seenPairs.add(pairKey);
        nicknamePairs.push({
          match_type: "nickname_prefix",
          normalized_key_a: keyA,
          normalized_key_b: keyB,
          members: [a, b],
        });
      }
    }
  }

  // ── Combine and annotate ─────────────────────────────────────────────────
  const allGroups = [...exactGroups, ...fuzzyPairs, ...nicknamePairs];

  const annotated = allGroups.map(g => {
    const members = g.members;

    // Flag when position or team mismatches — likely false positive
    const positions = [...new Set(members.map(m => m.position).filter(Boolean))];
    const teams = [...new Set(members.map(m => m.team).filter(Boolean))];
    const posConflict = positions.length > 1;
    const teamConflict = teams.length > 1;

    const warnings = [
      posConflict && `POSITION MISMATCH (${positions.join(" vs ")}) — likely different players`,
      teamConflict && `TEAM MISMATCH (${teams.join(" vs ")}) — verify`,
    ].filter(Boolean);

    return {
      match_type: g.match_type,
      ...(g.edit_distance !== undefined ? { edit_distance: g.edit_distance } : {}),
      ...(g.normalized_key !== undefined ? { normalized_key: g.normalized_key } : {}),
      ...(g.normalized_key_a !== undefined ? { normalized_key_a: g.normalized_key_a, normalized_key_b: g.normalized_key_b } : {}),
      warnings,
      members: members.map(m => ({
        id: m.id,
        name: m.name,
        position: m.position,
        team: m.team,
        adp_rank: m.adp_rank,
        normalized: fullNorm(m.name),
        usage: idToUsage[m.id] || [],
      })),
    };
  });

  // Sort: exact → nickname_prefix → fuzzy by distance → alphabetically
  const matchOrder = { exact_after_normalization: 0, nickname_prefix: 1, fuzzy: 2 };
  annotated.sort((a, b) => {
    const orderDiff = (matchOrder[a.match_type] ?? 99) - (matchOrder[b.match_type] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    if (a.edit_distance !== b.edit_distance) return (a.edit_distance || 0) - (b.edit_distance || 0);
    const keyA = a.normalized_key || a.normalized_key_a || "";
    const keyB = b.normalized_key || b.normalized_key_a || "";
    return keyA.localeCompare(keyB);
  });

  const exactCount    = annotated.filter(g => g.match_type === "exact_after_normalization").length;
  const nickCount     = annotated.filter(g => g.match_type === "nickname_prefix").length;
  const fuzzyCount    = annotated.filter(g => g.match_type === "fuzzy").length;
  const withWarnings  = annotated.filter(g => g.warnings.length > 0).length;

  const report = {
    summary: {
      total_players_scanned: players.length,
      exact_match_groups: exactCount,
      nickname_prefix_pairs: nickCount,
      fuzzy_match_pairs: fuzzyCount,
      groups_with_conflict_warnings: withWarnings,
      note: "Groups with POSITION or TEAM MISMATCH warnings are likely false positives — review carefully.",
    },
    groups: annotated,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => { console.error(err.message); process.exit(1); });
