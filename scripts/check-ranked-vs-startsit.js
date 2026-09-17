// Cross-checks every player ranked anywhere (redraft/dynasty rankings,
// auction rankings, weekly rankings) against the Start/Sit tool's player
// pool (players with a future player_prop_lines row).
//
// For any ranked player missing from Start/Sit, also checks SportsGameOdds'
// live event-player list to tell apart:
//   - a fixable name-normalization miss (SGO has the player under a name our
//     normalizer doesn't map — add an alias to lib/normalizePlayerName.js)
//   - a genuine absence (no game in the odds window, inactive/practice squad,
//     or SGO simply doesn't carry them) — nothing to fix in code.
//
// Read-only. Usage:
//   node --env-file=.env.local scripts/check-ranked-vs-startsit.js

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// The rankings/auction_rankings/weekly_rankings tables carry a pile of
// leftover "tmpcreator*"/"tmpeditor*"/"temp-weekly-test" rows from earlier
// feature testing (drag-and-drop, subscriber view mode, waiver tab). Only
// these two are real, live creators on the rankings tab.
const REAL_CREATORS = new Set(["ffhuddle", "rookierager"]);

const SGO_BASE = "https://api.sportsgameodds.com/v2";

function normalizePlayerName(name) {
  const FIRST_NAME_ALIASES = {
    kenneth: "kenny",
    cameron: "cam",
    kevin: "kc",
    andrew: "drew",
    joquavious: "woody",
    joshua: "josh",
    matthew: "matt",
  };
  const FULL_NAME_ALIASES = {
    "chigoziem okonokwo": "chig okonkwo",
    "jacory merritt": "jacory croskey-merritt",
  };
  const cleaned = name
    .toLowerCase()
    .replace(/[.']/g, "")
    .replace(/\s+jr\.?$/i, "")
    .replace(/\s+ii$/i, "")
    .replace(/\s+iii$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (FULL_NAME_ALIASES[cleaned]) return FULL_NAME_ALIASES[cleaned];
  const [first, ...rest] = cleaned.split(" ");
  return [FIRST_NAME_ALIASES[first] || first, ...rest].join(" ");
}

function parseRankingsPlayers(raw) {
  if (!raw) return { ranked: [], unranked: [] };
  if (Array.isArray(raw)) {
    const ranked = raw.filter((p) => !p.unranked);
    const unranked = raw.filter((p) => p.unranked);
    return { ranked, unranked };
  }
  return {
    ranked: Array.isArray(raw.ranked) ? raw.ranked : [],
    unranked: Array.isArray(raw.unranked) ? raw.unranked : [],
  };
}

// A ranking entry may be a bare integer id (current format) or a legacy
// embedded object — normalize either to an id.
function entryToId(entry) {
  if (typeof entry === "number") return entry;
  if (entry && typeof entry === "object" && typeof entry.id === "number") return entry.id;
  return null;
}

async function fetchAllRows(table, columns) {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Same 429 retry as app/api/cron/sync-player-props/route.js — this endpoint
// rate-limits bursts of page requests.
async function fetchWithRetry(url, options) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429 || attempt >= 5) return res;
    const retryAfterSec = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 1000 * 2 ** attempt;
    console.log(`  (SGO 429 — waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 1})`);
    await sleep(waitMs);
  }
}

async function fetchUpcomingEvents() {
  const now = new Date();
  const until = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000);
  const events = [];
  let cursor = null;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      leagueID: "NFL",
      type: "match",
      oddsAvailable: "true",
      started: "false",
      startsAfter: now.toISOString(),
      startsBefore: until.toISOString(),
      limit: "50",
    });
    if (cursor) params.set("cursor", cursor);
    if (page > 0) await sleep(500);
    const res = await fetchWithRetry(`${SGO_BASE}/events?${params.toString()}`, {
      headers: { "X-API-Key": process.env.SPORTSGAMEODDS_API_KEY },
    });
    if (!res.ok) throw new Error(`SGO events fetch failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    if (!body.success) throw new Error(`SGO error: ${JSON.stringify(body)}`);
    events.push(...(body.data || []));
    cursor = body.nextCursor || null;
    if (!cursor || (body.data || []).length === 0) break;
  }
  return events;
}

async function main() {
  console.log("Loading players table...");
  const players = await fetchAllRows("players", "id, name, position, team, status");
  const playerById = new Map(players.map((p) => [p.id, p]));

  console.log("Loading rankings, auction_rankings, weekly_rankings...");
  const [rankingRows, auctionRows, weeklyRows] = await Promise.all([
    fetchAllRows("rankings", "creator_id, format, players"),
    fetchAllRows("auction_rankings", "creator_id, format, players"),
    fetchAllRows("weekly_rankings", "creator_id, week, position, player_id"),
  ]);

  // id -> Set of "label" strings describing everywhere it's ranked.
  const rankedIn = new Map();
  const addRanked = (id, label) => {
    if (id == null) return;
    if (!rankedIn.has(id)) rankedIn.set(id, new Set());
    rankedIn.get(id).add(label);
  };

  for (const row of rankingRows) {
    if (!REAL_CREATORS.has(row.creator_id)) continue;
    // "unranked" is the leftover drag-and-drop pool shown in the rankings
    // editor (not yet assigned a rank) — only `ranked` counts as "ranked".
    const { ranked } = parseRankingsPlayers(row.players);
    for (const entry of ranked) {
      addRanked(entryToId(entry), `${row.creator_id}/${row.format}`);
    }
  }
  for (const row of auctionRows) {
    if (!REAL_CREATORS.has(row.creator_id)) continue;
    for (const entry of row.players || []) {
      const id = typeof entry?.player_id === "number" ? entry.player_id : entryToId(entry);
      addRanked(id, `${row.creator_id}/${row.format}`);
    }
  }
  for (const row of weeklyRows) {
    if (!REAL_CREATORS.has(row.creator_id)) continue;
    addRanked(row.player_id, `${row.creator_id}/week${row.week}/${row.position}`);
  }

  console.log(`Found ${rankedIn.size} distinct ranked player IDs.`);

  console.log("Loading Start/Sit projected player pool (future player_prop_lines)...");
  const propRows = await fetchAllRows("player_prop_lines", "player_id, game_starts_at");
  const now = new Date();
  const projectedIds = new Set(
    propRows.filter((r) => new Date(r.game_starts_at) > now).map((r) => r.player_id)
  );
  console.log(`Found ${projectedIds.size} players with a future prop line (Start/Sit pool).`);

  const allMissing = [...rankedIn.keys()]
    .filter((id) => !projectedIds.has(id))
    .map((id) => ({ id, player: playerById.get(id), labels: [...rankedIn.get(id)] }))
    .sort((a, b) => (a.player?.name || "").localeCompare(b.player?.name || ""));

  // Start/Sit only projects QB/RB/WR/TE (lib/fantasyProjection.js's
  // EXPECTED_STATS_BY_POSITION has no DST/K entries — SGO doesn't offer
  // passing/rushing/receiving O/U markets for a team defense or a kicker,
  // so there's structurally nothing to sync for them). Report those
  // separately instead of flagging them as a gap to fix.
  const outOfScope = allMissing.filter((m) => ["DST", "K"].includes(m.player?.position));
  const missing = allMissing.filter((m) => !["DST", "K"].includes(m.player?.position));

  console.log(`\n${allMissing.length} ranked players are missing from the Start/Sit pool (${missing.length} QB/RB/WR/TE, ${outOfScope.length} DST/K — out of scope, see below).\n`);
  if (missing.length === 0) {
    console.log("Nothing to do — every skill-position ranked player has a projection.");
    if (outOfScope.length > 0) printOutOfScope(outOfScope);
    return;
  }

  console.log("Fetching live SGO events to check for fixable name mismatches...");
  let sgoNamesByNorm = new Map();
  let sgoFetchOk = false;
  try {
    const events = await fetchUpcomingEvents();
    for (const event of events) {
      for (const p of Object.values(event.players || {})) {
        if (!p?.name) continue;
        const n = normalizePlayerName(p.name);
        if (!sgoNamesByNorm.has(n)) sgoNamesByNorm.set(n, new Set());
        sgoNamesByNorm.get(n).add(p.name);
      }
    }
    sgoFetchOk = true;
    console.log(`Loaded ${sgoNamesByNorm.size} distinct normalized names from ${events.length} upcoming SGO events.\n`);
  } catch (err) {
    console.warn(`Could not fetch SGO events (${err.message}) — skipping name-mismatch check.\n`);
  }

  if (!sgoFetchOk) {
    console.log(`=== ${missing.length} SKILL-POSITION PLAYERS MISSING (raw list — SGO cross-check unavailable, don't trust "not fixable" framing) ===`);
    for (const m of missing) {
      const label = m.player ? `"${m.player.name}" (${m.player.position}, ${m.player.team})` : `player_id=${m.id} (no players-table row — data issue)`;
      console.log(`  ${label} — ranked in: ${m.labels.join(", ")}`);
    }
    if (outOfScope.length > 0) printOutOfScope(outOfScope);
    return;
  }

  const fixable = [];
  const genuinelyAbsent = [];

  for (const m of missing) {
    if (!m.player) {
      genuinelyAbsent.push({ ...m, reason: "no players-table row found for this id (data issue)" });
      continue;
    }
    const n = normalizePlayerName(m.player.name);
    const sgoMatches = sgoNamesByNorm.get(n);
    if (sgoMatches) {
      // Our normalizer maps to a name that DOES appear in the SGO event feed,
      // yet no prop line landed — likely no O/U market offered for them
      // (e.g. deep backup) rather than a name bug.
      genuinelyAbsent.push({ ...m, reason: `in SGO events as "${[...sgoMatches].join('/')}" but no qualifying prop market` });
      continue;
    }
    // Try to find a close SGO name (same last name) that our normalizer isn't
    // catching — a candidate alias fix.
    const [, ...restTokens] = n.split(" ");
    const lastName = restTokens[restTokens.length - 1];
    const candidates = [...sgoNamesByNorm.entries()].filter(([sgoNorm]) => sgoNorm.endsWith(lastName));
    if (lastName && candidates.length > 0) {
      fixable.push({ ...m, candidates: candidates.flatMap(([, names]) => [...names]) });
    } else {
      genuinelyAbsent.push({ ...m, reason: "not found in upcoming SGO events at all (no game in window / inactive / not carried by feed)" });
    }
  }

  if (fixable.length > 0) {
    console.log(`\n=== ${fixable.length} LIKELY FIXABLE (name mismatch — add alias to lib/normalizePlayerName.js) ===`);
    for (const f of fixable) {
      console.log(`  "${f.player.name}" (${f.player.position}, ${f.player.team}) — ranked in: ${f.labels.join(", ")}`);
      console.log(`    SGO candidate name(s): ${f.candidates.join(", ")}`);
    }
  }

  if (genuinelyAbsent.length > 0) {
    console.log(`\n=== ${genuinelyAbsent.length} NOT FIXABLE VIA ALIAS (no code fix available) ===`);
    for (const g of genuinelyAbsent) {
      const label = g.player ? `"${g.player.name}" (${g.player.position}, ${g.player.team})` : `player_id=${g.id}`;
        console.log(`  ${label} — ranked in: ${g.labels.join(", ")} — ${g.reason}`);
    }
  }

  console.log(`\nSummary: ${missing.length} skill-position players missing | ${fixable.length} likely fixable via alias | ${genuinelyAbsent.length} not fixable via alias.`);
  if (outOfScope.length > 0) printOutOfScope(outOfScope);
}

function printOutOfScope(outOfScope) {
  console.log(`\n=== ${outOfScope.length} DST/K ranked players (out of scope — Start/Sit doesn't project defenses or kickers) ===`);
  for (const o of outOfScope) {
    console.log(`  "${o.player.name}" (${o.player.position}, ${o.player.team}) — ranked in: ${o.labels.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
