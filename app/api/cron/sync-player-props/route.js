import { createClient } from '@supabase/supabase-js';
import { normalizePlayerName } from '@/lib/normalizePlayerName';
import { fetchSgoEvents, buildRowsFromSgoEvents, upsertPropsRows } from '@/lib/propsSync';
import { fetchOddsApiRows } from '@/lib/oddsApiFallback';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// Manual-only full-league refresh — no longer on a schedule. Betting lines
// are now fetched on demand, one player's game at a time, the moment
// someone actually adds that player to Start/Sit Compare (see
// lib/ensurePlayerProps.js); this bulk path exists purely as a
// workflow_dispatch escape hatch (e.g. to warm the cache before a big
// slate, or recover after schema changes) rather than something that runs
// automatically and burns through SportsGameOdds' monthly object quota
// (or, once that fails, The Odds API's credit budget) fetching hundreds of
// players nobody was about to look at.
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

export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.SPORTSGAMEODDS_API_KEY) {
    return Response.json({ error: 'SPORTSGAMEODDS_API_KEY not configured' }, { status: 500 });
  }

  // Everything below hits Supabase and SportsGameOdds, both of which can
  // blip transiently — without this, an unhandled rejection crashes the
  // function before it can send a body, so the caller sees a bare 500 with
  // nothing in the response to diagnose.
  try {
    return await syncPlayerProps();
  } catch (err) {
    console.error('[sync-player-props] unhandled failure:', err);
    return Response.json({ error: err.message || String(err) }, { status: 500 });
  }
}

async function syncPlayerProps() {
  const players = await fetchAllPlayers();
  const byNorm = new Map();
  for (const p of players) {
    const n = normalizePlayerName(p.name);
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(p);
  }

  let events = null;
  let sgoError = null;
  try {
    events = await fetchSgoEvents();
  } catch (err) {
    sgoError = err;
    console.error('[sync-player-props] SGO events fetch failed:', err);
  }

  let source = 'sgo';
  let eventCount = 0;
  let rows;

  if (events) {
    eventCount = events.length;
    rows = buildRowsFromSgoEvents(events, byNorm);
  } else {
    // SGO's own request failed (typically a rate-limit/quota 429) — fall
    // back to The Odds API rather than failing the whole sync outright.
    source = 'odds_api';
    if (!process.env.ODDS_API_KEY) {
      return Response.json({ error: `SGO failed and ODDS_API_KEY not configured: ${sgoError.message}` }, { status: 500 });
    }
    try {
      const fallback = await fetchOddsApiRows(byNorm);
      eventCount = fallback.eventCount;
      rows = fallback;
      console.error(`[sync-player-props] Odds API fallback: events=${fallback.eventCount} lines=${fallback.lineRows.length} propsFetchFailures=${fallback.propsFetchFailures}`);
    } catch (fallbackErr) {
      console.error('[sync-player-props] Odds API fallback also failed:', fallbackErr);
      return Response.json({ error: `Both providers failed. SGO: ${sgoError.message}. OddsAPI: ${fallbackErr.message}` }, { status: 500 });
    }
  }

  try {
    await upsertPropsRows(supabase(), rows);
  } catch (err) {
    console.error('[sync-player-props] upsert failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
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

  // A successful SGO sync means fresh real coverage for this whole window —
  // any rows a prior outage's Odds API fallback left behind are now stale
  // and redundant (upsert never deletes a row for something it just stops
  // seeing), so clear them out rather than leaving two sources' data mixed.
  if (source === 'sgo') {
    const { error: purgeLinesErr } = await supabase().from('player_prop_lines').delete().like('sgo_event_id', 'oddsapi:%');
    if (purgeLinesErr) console.error('[sync-player-props] purge stale odds-api lines failed:', purgeLinesErr);
    const { error: purgeGameLinesErr } = await supabase().from('game_lines').delete().like('sgo_event_id', 'oddsapi:%');
    if (purgeGameLinesErr) console.error('[sync-player-props] purge stale odds-api game lines failed:', purgeGameLinesErr);
  }

  console.log(`[sync-player-props] source=${source} events=${eventCount} lines=${rows.lineRows.length} gameLines=${rows.gameLineRows.length} unmatched=${rows.unmatchedRows.length} skippedNoLine=${rows.skippedNoLine}`);
  return Response.json({
    ok: true,
    source,
    events: eventCount,
    lines: rows.lineRows.length,
    gameLines: rows.gameLineRows.length,
    unmatched: rows.unmatchedRows.length,
    skippedNoLine: rows.skippedNoLine,
  });
}
