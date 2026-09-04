import { createClient } from '@supabase/supabase-js';
import { fantasyPointsFromRealStats } from '@/lib/fantasyProjection';

let _supabase;
const supabase = () => (_supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY));

// Most recently *completed* season — bump this once the 2026 season wraps.
const SEASON = 2025;
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

  const res = await fetch(`https://api.sleeper.app/stats/nfl/${SEASON}?season_type=${SEASON_TYPE}`);
  if (!res.ok) {
    return Response.json({ error: `Sleeper stats fetch failed: ${res.status}` }, { status: 500 });
  }
  const entries = await res.json();

  // Compute fantasy points for every entry with a fantasy-relevant position —
  // ranking has to consider everyone who played, not just players in our DB,
  // so a player's "finish" reflects the whole league, not just our roster.
  const withPoints = entries
    .filter((e) => FANTASY_POSITIONS.has(e.player?.position))
    .map((e) => {
      const s = extractStats(e.stats || {});
      const fantasyPoints = fantasyPointsFromRealStats({
        passYd: s.pass_yd, passTd: s.pass_td,
        rushYd: s.rush_yd, rushTd: s.rush_td,
        recYd: s.rec_yd, recTd: s.rec_td, rec: s.rec,
      });
      return { sleeperId: e.player_id, position: e.player.position, gp: e.stats?.gp ?? 0, stats: s, fantasyPoints };
    });

  const byPosition = {};
  for (const p of FANTASY_POSITIONS) {
    byPosition[p] = withPoints
      .filter((e) => e.position === p)
      .sort((a, b) => b.fantasyPoints - a.fantasyPoints);
  }
  const finishBySleeperId = {};
  for (const list of Object.values(byPosition)) {
    list.forEach((e, i) => { finishBySleeperId[e.sleeperId] = i + 1; });
  }

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
    .filter((e) => playerIdBySleeperId[e.sleeperId] && e.gp > 0)
    .map((e) => ({
      player_id: playerIdBySleeperId[e.sleeperId],
      season: SEASON,
      season_type: SEASON_TYPE,
      position: e.position,
      games_played: e.gp,
      stats: e.stats,
      fantasy_points: e.fantasyPoints,
      fantasy_finish: finishBySleeperId[e.sleeperId] ?? null,
      updated_at: new Date().toISOString(),
    }));

  const BATCH = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase()
      .from('player_season_stats')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'player_id,season,season_type' });
    if (error) {
      console.error('[sync-season-stats] upsert failed:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    upserted += Math.min(BATCH, rows.length - i);
  }

  return Response.json({ ok: true, season: SEASON, totalEntries: entries.length, fantasyRelevant: withPoints.length, upserted });
}
