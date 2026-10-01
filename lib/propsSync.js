import { normalizePlayerName } from '@/lib/normalizePlayerName';

// SportsGameOdds fetching/processing, shared between the manual bulk sync
// (app/api/cron/sync-player-props, workflow_dispatch only — no longer on a
// schedule) and the on-demand per-player fetch (lib/ensurePlayerProps.js).
// The bulk path scans every upcoming NFL event; the on-demand path scopes
// the same request to one team via SGO's `teamID` filter, which is the
// actual fix for the object-quota problem — SGO's Free plan is metered by
// objects returned, not request count, and a single team's event carries
// far fewer nested player/odds objects than the whole week's slate.
const SGO_BASE = 'https://api.sportsgameodds.com/v2';

// The over/under stat categories the Start/Sit tab projects fantasy points
// from. Touchdowns are handled separately below — SportsGameOdds doesn't
// offer split rushing_touchdowns/receiving_touchdowns O/U markets for most
// skill players, only a combined "anytime touchdown" Yes/No moneyline.
export const TARGET_STAT_IDS = new Set([
  'passing_yards',
  'passing_touchdowns',
  'rushing_yards',
  'receiving_yards',
  'receiving_receptions',
]);

// American odds -> implied probability, e.g. +160 -> 0.3846, -114 -> 0.5327.
export function americanOddsToProbability(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}

// Inverse, for displaying a blended probability as odds.
export function probabilityToAmericanOdds(p) {
  if (!(p > 0) || !(p < 1)) return null;
  const odds = p >= 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p;
  const rounded = Math.round(odds);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

// SportsGameOdds returns pricing in two different shapes depending on the
// player/market: well-covered players get a full byBookmaker breakdown
// (draftkings, fanduel, caesars, ...), but for lower-profile players it
// often comes back with byBookmaker entirely empty while a real, current
// aggregate price still sits directly on the odd object as bookOdds /
// bookOverUnder — confirmed live against an actual DraftKings line that
// only showed up there, not in byBookmaker. Treating that as just another
// candidate (rather than only reading byBookmaker) is the difference
// between silently skipping a player and picking up their real price.
function bookCandidates(odd) {
  const candidates = Object.entries(odd?.byBookmaker || {})
    .filter(([, entry]) => entry?.available && entry.odds !== undefined && entry.odds !== null)
    .map(([book, entry]) => ({ book, overUnder: entry.overUnder, odds: entry.odds }));
  if (odd?.bookOddsAvailable && odd.bookOdds !== undefined && odd.bookOdds !== null) {
    candidates.push({ book: 'aggregate', overUnder: odd.bookOverUnder, odds: odd.bookOdds });
  }
  return candidates;
}

// Different books (and the aggregate above) often post genuinely different
// lines for the same player, not just different odds on the same number —
// e.g. one priced at 223.5 near-even, another at 216.5 priced -135. A line
// one side is heavily favored on isn't the book's honest expected value,
// it's a hedge; the line priced closest to a true coin-flip (50% implied
// probability, i.e. -100/+100) is the most honest single estimate available.
export function fairestBook(odd) {
  let best = null;
  let bestDist = Infinity;
  for (const c of bookCandidates(odd)) {
    if (c.overUnder === undefined || c.overUnder === null) continue;
    const prob = americanOddsToProbability(c.odds);
    if (prob === null) continue;
    const dist = Math.abs(prob - 0.5);
    if (dist < bestDist) {
      bestDist = dist;
      best = { book: c.book, overUnder: Number(c.overUnder), odds: c.odds };
    }
  }
  return best;
}

export function fairestLine(odd) {
  return fairestBook(odd)?.overUnder ?? null;
}

// Same "use every source" widening for the anytime-TD Yes/No moneyline, but
// odds don't average linearly — blend in probability space, then convert
// back for display. Unlike fairestBook above, every source's probability
// here is itself a usable estimate (there's no "line" to correct for skew),
// so blending across all of them (including the aggregate) is more stable.
export function blendedProbability(odd) {
  const probs = bookCandidates(odd)
    .map((c) => americanOddsToProbability(c.odds))
    .filter((p) => p !== null);
  if (probs.length === 0) return null;
  return probs.reduce((a, b) => a + b, 0) / probs.length;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// SportsGameOdds occasionally 429s this route — confirmed live on
// 2026-09-16, twice, both from a 10-page pagination loop firing in quick
// succession. Retries a 429 up to 3 times, honoring Retry-After when SGO
// sends one, else backing off 1s/2s/4s; any other non-ok status still fails
// immediately (not a rate limit, retrying won't help).
async function fetchWithRetry(url, options) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429 || attempt >= 3) return res;
    const retryAfterSec = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 1000 * 2 ** attempt;
    await sleep(waitMs);
  }
}

// `teamID`, when given, scopes the request to one team's events via SGO's
// own filter — this is the actual quota fix (fewer nested objects in the
// response), not just fewer requests. Without it, scans the full 9-day
// upcoming window (the old bulk-sync behavior).
export async function fetchSgoEvents({ teamID } = {}) {
  const now = new Date();
  const until = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000);

  const events = [];
  let cursor = null;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      leagueID: 'NFL',
      type: 'match',
      oddsAvailable: 'true',
      started: 'false',
      startsAfter: now.toISOString(),
      startsBefore: until.toISOString(),
      // Scoped-by-team calls only need that team's very next game — not
      // every upcoming matchup in the 9-day window — to keep the on-demand
      // fetch's object count as small as possible.
      limit: teamID ? '1' : '50',
    });
    if (teamID) params.set('teamID', teamID);
    if (cursor) params.set('cursor', cursor);

    // Small gap between pages — the failures we saw were a burst-rate 429
    // from firing all ~10 requests back to back, not a sustained quota.
    if (page > 0) await sleep(300);

    const res = await fetchWithRetry(`${SGO_BASE}/events?${params.toString()}`, {
      headers: { 'X-API-Key': process.env.SPORTSGAMEODDS_API_KEY },
    });
    if (!res.ok) throw new Error(`SportsGameOdds events fetch failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    if (!body.success) throw new Error(`SportsGameOdds error: ${JSON.stringify(body)}`);

    events.push(...(body.data || []));
    cursor = body.nextCursor || null;
    if (!cursor || (body.data || []).length === 0) break;
  }
  return events;
}

// Turns a list of SGO event objects into the exact row shapes
// player_prop_lines/game_lines expect. `byNorm` is a normalized-player-name
// -> players[] map — pass every player who could plausibly appear (the
// whole roster for a bulk sync, or just both teams' rosters for an
// on-demand single-game fetch).
export function buildRowsFromSgoEvents(events, byNorm) {
  const lineRowsByKey = new Map();
  const gameLineRows = [];
  const unmatchedRows = [];
  let skippedNoLine = 0;

  for (const event of events) {
    const teams = event.teams || {};
    const homeID = teams.home?.teamID;
    const awayID = teams.away?.teamID;
    const gameStartsAt = event.status?.startsAt;
    if (!gameStartsAt) continue;

    const eventPlayers = event.players || {};
    const odds = event.odds || {};

    // Game-level total + each team's implied total — deterministic oddIDs,
    // no need to scan for them like the per-player markets below.
    const gameTotal = fairestLine(odds['points-all-game-ou-over']);
    const homeTeamTotal = fairestLine(odds['points-home-game-ou-over']);
    const awayTeamTotal = fairestLine(odds['points-away-game-ou-over']);
    if (gameTotal !== null || homeTeamTotal !== null || awayTeamTotal !== null) {
      gameLineRows.push({
        sgo_event_id: event.eventID,
        home_team_id: homeID || null,
        away_team_id: awayID || null,
        game_total: gameTotal,
        home_team_total: homeTeamTotal,
        away_team_total: awayTeamTotal,
        game_starts_at: gameStartsAt,
        updated_at: new Date().toISOString(),
      });
    }

    for (const odd of Object.values(odds)) {
      if (odd.periodID !== 'game') continue; // full-game line only — skip 1q/2q/1h/etc sub-markets

      const isOverUnderStat = odd.sideID === 'over' && TARGET_STAT_IDS.has(odd.statID);
      // Anytime-touchdown moneyline: the only broadly-offered TD market for
      // skill players (rushing_touchdowns/receiving_touchdowns O/U markets
      // barely exist). "yes" side gives the blended probability of >=1 TD.
      const isAnytimeTd = odd.statID === 'touchdowns' && odd.betTypeID === 'yn' && odd.sideID === 'yes';
      if (!isOverUnderStat && !isAnytimeTd) continue;

      const sgoPlayerID = odd.playerID || odd.statEntityID;
      if (!sgoPlayerID || !eventPlayers[sgoPlayerID]) continue;

      const statId = isAnytimeTd ? 'anytime_touchdowns' : odd.statID;
      let line;
      let overOdds;
      let underOdds;

      if (isAnytimeTd) {
        const prob = blendedProbability(odd);
        if (prob === null) { skippedNoLine++; continue; }
        line = prob;
        overOdds = probabilityToAmericanOdds(prob);
        const noOdd = odd.opposingOddID ? odds[odd.opposingOddID] : null;
        const noProb = noOdd ? blendedProbability(noOdd) : null;
        underOdds = noProb !== null ? probabilityToAmericanOdds(noProb) : null;
      } else {
        const picked = fairestBook(odd);
        if (!picked) { skippedNoLine++; continue; }
        line = picked.overUnder;
        overOdds = picked.odds;
        const underOdd = odd.opposingOddID ? odds[odd.opposingOddID] : null;
        // Prefer the same book's price on the under side for consistency
        // with the chosen over line; fall back to that side's own fairest
        // price (byBookmaker or aggregate) if the one we picked didn't
        // quote it there specifically.
        const sameBookUnder = picked.book !== 'aggregate' ? underOdd?.byBookmaker?.[picked.book] : null;
        underOdds = sameBookUnder?.available ? sameBookUnder.odds : (fairestBook(underOdd)?.odds ?? null);
      }

      const playerInfo = eventPlayers[sgoPlayerID];
      const playerTeamID = playerInfo.teamID;
      const homeAway = playerTeamID === homeID ? 'home' : playerTeamID === awayID ? 'away' : null;
      const opponentID = playerTeamID === homeID ? awayID : playerTeamID === awayID ? homeID : null;

      const n = normalizePlayerName(playerInfo.name);
      const candidates = byNorm.get(n) || [];
      const match = candidates.length === 1 ? candidates[0] : null;

      if (!match) {
        unmatchedRows.push({
          sgo_player_id: sgoPlayerID,
          sgo_event_id: event.eventID,
          stat_id: statId,
          line: Number(line),
        });
        continue;
      }

      const key = `${match.id}|${event.eventID}|${statId}`;
      lineRowsByKey.set(key, {
        player_id: match.id,
        sgo_player_id: sgoPlayerID,
        sgo_event_id: event.eventID,
        stat_id: statId,
        line: Number(line),
        over_odds: overOdds,
        under_odds: underOdds,
        team_id: playerTeamID || null,
        opponent_id: opponentID || null,
        home_away: homeAway,
        game_starts_at: gameStartsAt,
        updated_at: new Date().toISOString(),
      });
    }
  }

  return { lineRows: [...lineRowsByKey.values()], gameLineRows, unmatchedRows, skippedNoLine };
}

// Shared upsert for either path above — identical regardless of which
// provider (or scope) produced the rows.
export async function upsertPropsRows(supabase, { lineRows, gameLineRows, unmatchedRows }) {
  if (lineRows.length > 0) {
    const { error } = await supabase
      .from('player_prop_lines')
      .upsert(lineRows, { onConflict: 'player_id,sgo_event_id,stat_id' });
    if (error) throw error;
  }

  if (unmatchedRows.length > 0) {
    const { error } = await supabase
      .from('player_prop_unmatched')
      .upsert(unmatchedRows, { onConflict: 'sgo_player_id,sgo_event_id,stat_id', ignoreDuplicates: true });
    if (error) console.error('[propsSync] upsert unmatched failed:', error);
  }

  if (gameLineRows.length > 0) {
    const { error } = await supabase
      .from('game_lines')
      .upsert(gameLineRows, { onConflict: 'sgo_event_id' });
    if (error) console.error('[propsSync] upsert game lines failed:', error);
  }
}
