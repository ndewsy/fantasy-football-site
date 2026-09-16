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

export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: games, error: gamesError } = await supabase()
    .from('season_games')
    .select('week, status, kickoff_at')
    .order('kickoff_at', { ascending: true });
  if (gamesError) return Response.json({ error: gamesError.message }, { status: 500 });

  // Only the most recently *completed* week has final stats worth syncing —
  // the active/upcoming week (what this helper normally returns) is still in
  // progress or hasn't kicked off.
  const week = getCurrentWeekFromGames(games || []) - 1;
  if (week < 1) {
    return Response.json({ ok: true, skipped: true, reason: 'no completed week yet' });
  }

  const res = await fetch(`https://api.sleeper.app/stats/nfl/${CURRENT_SEASON}/${week}?season_type=${SEASON_TYPE}`);
  if (!res.ok) {
    return Response.json({ error: `Sleeper stats fetch failed: ${res.status}` }, { status: 500 });
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

  // Supabase caps a plain select at 1000 rows — paginate to get every player.
  const players = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error: playersError } = await supabase()
      .from('players')
      .select('id, sleeper_id')
      .not('sleeper_id', 'is', null)
      .range(from, from + PAGE - 1);
    if (playersError) return Response.json({ error: playersError.message }, { status: 500 });
    players.push(...data);
    if (data.length < PAGE) break;
  }
  const playerIdBySleeperId = Object.fromEntries(players.map((p) => [p.sleeper_id, p.id]));

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
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase()
      .from('player_week_stats')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'player_id,season,week,season_type' });
    if (error) {
      console.error('[sync-week-stats] upsert failed:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    upserted += Math.min(BATCH, rows.length - i);
  }

  return Response.json({ ok: true, season: CURRENT_SEASON, week, totalEntries: entries.length, fantasyRelevant: withPoints.length, upserted });
}
