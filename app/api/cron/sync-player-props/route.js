import { createClient } from '@supabase/supabase-js';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

const SGO_BASE = 'https://api.sportsgameodds.com/v2';

// The stat categories the Start/Sit tab projects fantasy points from.
const TARGET_STAT_IDS = new Set([
  'passing_yards',
  'passing_touchdowns',
  'rushing_yards',
  'rushing_touchdowns',
  'receiving_yards',
  'receiving_touchdowns',
  'receiving_receptions',
]);

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

    for (const odd of Object.values(odds)) {
      if (odd.sideID !== 'over') continue;
      if (odd.periodID !== 'game') continue; // full-game line only — skip 1q/2q/1h/etc sub-markets
      if (!TARGET_STAT_IDS.has(odd.statID)) continue;
      const sgoPlayerID = odd.playerID || odd.statEntityID;
      if (!sgoPlayerID || !eventPlayers[sgoPlayerID]) continue;

      // DraftKings specifically, per-book — bookOverUnder/fairOverUnder are
      // cross-book blends that can drift from what's actually on the site.
      const dk = odd.byBookmaker?.draftkings;
      if (!dk?.available || dk.overUnder === undefined || dk.overUnder === null) {
        skippedNoLine++;
        continue;
      }
      const line = dk.overUnder;

      const underOdd = odd.opposingOddID ? odds[odd.opposingOddID] : null;
      const underDk = underOdd?.byBookmaker?.draftkings;

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
          stat_id: odd.statID,
          line: Number(line),
        });
        continue;
      }

      const key = `${match.id}|${event.eventID}|${odd.statID}`;
      lineRowsByKey.set(key, {
        player_id: match.id,
        sgo_player_id: sgoPlayerID,
        sgo_event_id: event.eventID,
        stat_id: odd.statID,
        line: Number(line),
        over_odds: dk.odds ?? null,
        under_odds: underDk?.odds ?? null,
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

  console.log(`[sync-player-props] events=${events.length} lines=${lineRows.length} unmatched=${unmatchedRows.length} skippedNoLine=${skippedNoLine}`);
  return Response.json({
    ok: true,
    events: events.length,
    lines: lineRows.length,
    unmatched: unmatchedRows.length,
    skippedNoLine,
  });
}
