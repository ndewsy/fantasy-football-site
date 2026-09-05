import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

const SGO_BASE = 'https://api.sportsgameodds.com/v2';

// The over/under stat categories the Start/Sit tab projects fantasy points
// from. Touchdowns are handled separately below — SportsGameOdds doesn't
// offer split rushing_touchdowns/receiving_touchdowns O/U markets for most
// skill players, only a combined "anytime touchdown" Yes/No moneyline.
const TARGET_STAT_IDS = new Set([
  'passing_yards',
  'passing_touchdowns',
  'rushing_yards',
  'receiving_yards',
  'receiving_receptions',
]);

// American odds -> implied probability, e.g. +160 -> 0.3846, -114 -> 0.5327.
function americanOddsToProbability(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}

// Inverse, for displaying a blended probability as odds.
function probabilityToAmericanOdds(p) {
  if (!(p > 0) || !(p < 1)) return null;
  const odds = p >= 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p;
  const rounded = Math.round(odds);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

const TRACKED_BOOKS = ['draftkings', 'fanduel'];

// Average whichever of the tracked books have a number for this odd — using
// more than one sharp book smooths out a single book's noise/bias. Falls
// back to whatever's available if only one book has this market.
function blendedLine(byBookmaker) {
  const values = TRACKED_BOOKS
    .map((book) => byBookmaker?.[book])
    .filter((b) => b?.available && b.overUnder !== undefined && b.overUnder !== null)
    .map((b) => Number(b.overUnder));
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Same idea for a Yes/No moneyline, but odds don't average linearly — blend
// in probability space, then convert back for display.
function blendedProbability(byBookmaker) {
  const probs = TRACKED_BOOKS
    .map((book) => byBookmaker?.[book])
    .filter((b) => b?.available)
    .map((b) => americanOddsToProbability(b.odds))
    .filter((p) => p !== null);
  if (probs.length === 0) return null;
  return probs.reduce((a, b) => a + b, 0) / probs.length;
}

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[.']/g, '')
    .replace(/\s+jr\.?$/i, '')
    .replace(/\s+ii$/i, '')
    .replace(/\s+iii$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchAllPlayers() {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase()
      .from('players')
      .select('id, name, position, team')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

async function fetchUpcomingEvents() {
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
      limit: '50',
    });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${SGO_BASE}/events?${params.toString()}`, {
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

export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.SPORTSGAMEODDS_API_KEY) {
    return Response.json({ error: 'SPORTSGAMEODDS_API_KEY not configured' }, { status: 500 });
  }

  const players = await fetchAllPlayers();
  const byNorm = new Map();
  for (const p of players) {
    const n = normalize(p.name);
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(p);
  }

  let events;
  try {
    events = await fetchUpcomingEvents();
  } catch (err) {
    console.error('[sync-player-props] events fetch failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }

  // Keyed by player_id|sgo_event_id|stat_id (the table's real unique
  // constraint) — Postgres' ON CONFLICT DO UPDATE errors out if a single
  // upsert tries to touch the same conflict key twice, so any leftover
  // duplicate is deduped here as a safety net even with the periodID filter
  // above narrowing each stat down to one full-game "over" odd.
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
    const gameTotal = blendedLine(odds['points-all-game-ou-over']?.byBookmaker);
    const homeTeamTotal = blendedLine(odds['points-home-game-ou-over']?.byBookmaker);
    const awayTeamTotal = blendedLine(odds['points-away-game-ou-over']?.byBookmaker);
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
        const prob = blendedProbability(odd.byBookmaker);
        if (prob === null) { skippedNoLine++; continue; }
        line = prob;
        overOdds = probabilityToAmericanOdds(prob);
        const noOdd = odd.opposingOddID ? odds[odd.opposingOddID] : null;
        const noProb = noOdd ? blendedProbability(noOdd.byBookmaker) : null;
        underOdds = noProb !== null ? probabilityToAmericanOdds(noProb) : null;
      } else {
        const blended = blendedLine(odd.byBookmaker);
        if (blended === null) { skippedNoLine++; continue; }
        line = blended;
        overOdds = odd.byBookmaker?.draftkings?.odds ?? odd.byBookmaker?.fanduel?.odds ?? null;
        const underOdd = odd.opposingOddID ? odds[odd.opposingOddID] : null;
        underOdds = underOdd?.byBookmaker?.draftkings?.odds ?? underOdd?.byBookmaker?.fanduel?.odds ?? null;
      }

      const playerInfo = eventPlayers[sgoPlayerID];
      const playerTeamID = playerInfo.teamID;
      const homeAway = playerTeamID === homeID ? 'home' : playerTeamID === awayID ? 'away' : null;
      const opponentID = playerTeamID === homeID ? awayID : playerTeamID === awayID ? homeID : null;

      const n = normalize(playerInfo.name);
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

  const lineRows = [...lineRowsByKey.values()];

  if (lineRows.length > 0) {
    const { error } = await supabase()
      .from('player_prop_lines')
      .upsert(lineRows, { onConflict: 'player_id,sgo_event_id,stat_id' });
    if (error) {
      console.error('[sync-player-props] upsert lines failed:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  if (unmatchedRows.length > 0) {
    const { error } = await supabase()
      .from('player_prop_unmatched')
      .upsert(unmatchedRows, { onConflict: 'sgo_player_id,sgo_event_id,stat_id', ignoreDuplicates: true });
    if (error) console.error('[sync-player-props] upsert unmatched failed:', error);
  }

  if (gameLineRows.length > 0) {
    const { error } = await supabase()
      .from('game_lines')
      .upsert(gameLineRows, { onConflict: 'sgo_event_id' });
    if (error) console.error('[sync-player-props] upsert game lines failed:', error);
  }

  // Belt-and-suspenders cleanup: these two stat_ids predate anytime_touchdowns
  // and are no longer written above, but upsert never removes rows for a
  // category that's stopped being synced — any left over from before this
  // change would silently double-count touchdowns alongside the anytime-TD
  // line in a player's projection.
  const { error: purgeError } = await supabase()
    .from('player_prop_lines')
    .delete()
    .in('stat_id', ['rushing_touchdowns', 'receiving_touchdowns']);
  if (purgeError) console.error('[sync-player-props] purge legacy TD stat_ids failed:', purgeError);

  console.log(`[sync-player-props] events=${events.length} lines=${lineRows.length} gameLines=${gameLineRows.length} unmatched=${unmatchedRows.length} skippedNoLine=${skippedNoLine}`);
  return Response.json({
    ok: true,
    events: events.length,
    lines: lineRows.length,
    gameLines: gameLineRows.length,
    unmatched: unmatchedRows.length,
    skippedNoLine,
  });
}
