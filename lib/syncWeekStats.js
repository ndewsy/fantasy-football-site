import { createClient } from '@supabase/supabase-js';
import { fantasyPointsFromRealStats } from '@/lib/fantasyProjection';
import { getCurrentWeekFromGames } from '@/lib/currentWeek';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// The season currently in progress — bump this once the 2027 season starts.
const CURRENT_SEASON = 2026;
const SEASON_TYPE = 'regular';
const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

function extractStats(raw) {
  return {
    pass_att: raw.pass_att ?? 0,
    pass_cmp: raw.pass_cmp ?? 0,
    pass_yd: raw.pass_yd ?? 0,
    pass_td: raw.pass_td ?? 0,
    pass_int: raw.pass_int ?? 0,
    rush_att: raw.rush_att ?? 0,
    rush_yd: raw.rush_yd ?? 0,
    rush_td: raw.rush_td ?? 0,
    rec: raw.rec ?? 0,
    rec_tgt: raw.rec_tgt ?? 0,
    rec_yd: raw.rec_yd ?? 0,
    rec_td: raw.rec_td ?? 0,
  };
}

// Pulls the active week (+ the prior week, for Sleeper's occasional stat
// corrections) from Sleeper and upserts into player_week_stats. Shared by
// the scheduled cron (app/api/cron/sync-week-stats/route.js) and the
// on-demand freshness check in app/api/players/stats/route.js — GitHub
// Actions' schedule trigger is not reliable at sub-hour intervals (observed
// gaps of 2-4+ hours against a 5-minute cron), so real freshness comes from
// a page load triggering this directly when the stored data is stale,
// rather than from the schedule alone.
export async function syncWeekStats() {
  const { data: games, error: gamesError } = await supabase()
    .from('season_games')
    .select('week, status, kickoff_at')
    .order('kickoff_at', { ascending: true });
  if (gamesError) throw gamesError;

  const activeWeek = getCurrentWeekFromGames(games || []);
  const weeksToSync = [activeWeek, activeWeek - 1].filter((w) => w >= 1);
  if (weeksToSync.length === 0) {
    return { ok: true, skipped: true, reason: 'no week to sync yet' };
  }

  const players = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error: playersError } = await supabase()
      .from('players')
      .select('id, sleeper_id')
      .not('sleeper_id', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1);
    if (playersError) throw playersError;
    players.push(...data);
    if (data.length < PAGE) break;
  }
  const playerIdBySleeperId = Object.fromEntries(players.map((p) => [p.sleeper_id, p.id]));

  const results = [];
  for (const week of weeksToSync) {
    const res = await fetch(`https://api.sleeper.app/stats/nfl/${CURRENT_SEASON}/${week}?season_type=${SEASON_TYPE}`);
    if (!res.ok) {
      results.push({ week, error: `Sleeper stats fetch failed: ${res.status}` });
      continue;
    }
    const entries = await res.json();

    const withPoints = entries
      .filter((e) => FANTASY_POSITIONS.has(e.player?.position) && (e.stats?.gp ?? 0) > 0)
      .map((e) => {
        const s = extractStats(e.stats || {});
        const fantasyPoints = fantasyPointsFromRealStats({
          passYd: s.pass_yd, passTd: s.pass_td,
          rushYd: s.rush_yd, rushTd: s.rush_td,
          recYd: s.rec_yd, recTd: s.rec_td, rec: s.rec,
        });
        return { sleeperId: e.player_id, position: e.player.position, stats: s, fantasyPoints, opponent: e.opponent || null };
      });

    const rows = withPoints
      .filter((e) => playerIdBySleeperId[e.sleeperId])
      .map((e) => ({
        player_id: playerIdBySleeperId[e.sleeperId],
        season: CURRENT_SEASON,
        week,
        season_type: SEASON_TYPE,
        position: e.position,
        stats: e.stats,
        fantasy_points: e.fantasyPoints,
        opponent: e.opponent,
        updated_at: new Date().toISOString(),
      }));

    const BATCH = 500;
    let upserted = 0;
    let upsertError = null;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase()
        .from('player_week_stats')
        .upsert(rows.slice(i, i + BATCH), { onConflict: 'player_id,season,week,season_type' });
      if (error) {
        console.error(`[syncWeekStats] upsert failed for week ${week}:`, error);
        upsertError = error.message;
        break;
      }
      upserted += Math.min(BATCH, rows.length - i);
    }

    results.push({ week, totalEntries: entries.length, fantasyRelevant: withPoints.length, upserted, error: upsertError });
  }

  return { ok: true, season: CURRENT_SEASON, weeks: results };
}

// GitHub Actions' schedule trigger isn't reliable at sub-hour intervals in
// practice (observed gaps of 2-4+ hours against a 5-minute cron) — rather
// than chase a tighter cron that still isn't guaranteed to fire, callers
// that read player_week_stats check staleness directly and sync inline
// here, so freshness tracks real traffic instead of a scheduler.
const STALE_AFTER_MS = 3 * 60 * 1000;

export async function ensureFreshWeekStats() {
  const { data, error } = await supabase()
    .from('player_week_stats')
    .select('updated_at')
    .eq('season', CURRENT_SEASON)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const lastSync = data?.updated_at ? new Date(data.updated_at).getTime() : 0;
  if (Date.now() - lastSync > STALE_AFTER_MS) {
    await syncWeekStats();
  }
}

export { CURRENT_SEASON };
